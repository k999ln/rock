package dev.rock.automation;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.IBinder;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import dev.rock.core.Engine;
import dev.rock.core.platform.ComponentManifest;
import dev.rock.core.platform.EncryptedBackup;
import dev.rock.core.platform.PlatformApi;
import dev.rock.core.platform.PlatformStore;
import dev.rock.sdk.IPlatformApi;
import dev.rock.sdk.IPlatformCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONArray;
import org.json.JSONObject;

/** Signature-permission OS broker for the versioned avocadoOS Platform API. */
public final class RockPlatformService extends Service {
    static final String EXTRA_APPROVAL_ID = "approvalId";
    private static final String KEY_ALIAS = "rockstar-platform-backup-v1";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private final IPlatformApi.Stub binder = new IPlatformApi.Stub() {
        @Override public int getApiVersion() { return PlatformApi.VERSION; }

        @Override public void registerComponent(String requestId, String json, IPlatformCallback callback) {
            run(requestId, callback, () -> {
                JSONObject input = boundedJson(json);
                ComponentManifest manifest = verifiedManifest(input);
                PlatformStore platform = platform();
                String digest = platform.register(requestId, manifest, now());
                platform.activate(manifest.componentId, manifest.versionCode,
                    input.optBoolean("rollback", false), now());
                return new Result(manifest.componentId, digest);
            });
        }

        @Override public void requestApproval(String requestId, String componentId, String action,
            String payloadDigest, long maxCostMinor, long expiresAt, IPlatformCallback callback) {
            final String owner = owner();
            run(requestId, callback, () -> {
                String approvalId = platform().proposeApproval(owner, requestId, componentId, action,
                    payloadDigest, maxCostMinor, expiresAt, now());
                Intent confirmation = new Intent(RockPlatformService.this, ApprovalActivity.class)
                    .putExtra(EXTRA_APPROVAL_ID, approvalId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { startActivity(confirmation); }
                catch (RuntimeException backgroundLaunchDeferred) { /* The foreground broker can open it later. */ }
                return new Result(approvalId, Engine.digest(approvalId));
            });
        }

        @Override public void stopComponent(String requestId, String componentId, IPlatformCallback callback) {
            run(requestId, callback, () -> {
                long generation = platform().stop(componentId, now());
                return new Result(Long.toString(generation), Engine.digest(componentId + ":" + generation));
            });
        }

        @Override public void revokeComponent(String requestId, String componentId, IPlatformCallback callback) {
            run(requestId, callback, () -> {
                platform().revoke(componentId, now());
                return new Result(componentId, Engine.digest("revoked:" + componentId));
            });
        }

        @Override public void recordLedgerReceipt(String requestId, String approvalId, String componentId,
            String action, String payloadDigest, long actualCostMinor, long amountMinor,
            String currency, IPlatformCallback callback) {
            final String owner = owner();
            run(requestId, callback, () -> {
                String receipt = platform().recordApproved(owner, requestId, approvalId, componentId,
                    action, payloadDigest, actualCostMinor, amountMinor, currency, now());
                return new Result(receipt, Engine.digest(receipt));
            });
        }

        @Override public void recordProviderReceipt(String requestId, String providerId, long amountMinor,
            String currency, String providerReference, String receiptDigest, IPlatformCallback callback) {
            final String owner = owner();
            run(requestId, callback, () -> {
                String receipt = platform().recordProviderReceipt(owner, requestId, providerId, amountMinor,
                    currency, providerReference, receiptDigest, now());
                return new Result(receipt, Engine.digest(receipt));
            });
        }

        @Override public void createEncryptedBackup(String requestId, IPlatformCallback callback) {
            final String owner = owner();
            run(requestId, callback, () -> createBackup(owner, requestId));
        }
    };

    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public void onDestroy() { worker.shutdownNow(); super.onDestroy(); }

    private PlatformStore platform() { return ((RockApplication) getApplication()).platform(); }
    private static long now() { return System.currentTimeMillis(); }
    private String owner() {
        return AndroidOwner.forUid(this, android.os.Binder.getCallingUid());
    }

    private void run(String requestId, IPlatformCallback callback, Operation operation) {
        if (callback == null || requestId == null || !requestId.matches("[A-Za-z0-9:._-]{1,160}")) return;
        worker.execute(() -> {
            try {
                Result result = operation.run();
                callback.onResult(requestId, "OK", result.id, result.digest);
            } catch (SecurityException denied) {
                reply(callback, requestId, "DENIED");
            } catch (IllegalArgumentException invalid) {
                reply(callback, requestId, "INVALID");
            } catch (IllegalStateException conflict) {
                reply(callback, requestId, "CONFLICT");
            } catch (Exception failure) {
                reply(callback, requestId, "FAILED");
            }
        });
    }

    private static void reply(IPlatformCallback callback, String requestId, String status) {
        try { callback.onResult(requestId, status, "", Engine.digest(status + ":" + requestId)); }
        catch (Exception ignored) { }
    }

    private JSONObject boundedJson(String json) throws Exception {
        if (json == null || json.length() == 0 || json.length() > 16_384) throw new IllegalArgumentException("INVALID_MANIFEST");
        return new JSONObject(json);
    }

    private ComponentManifest verifiedManifest(JSONObject input) throws Exception {
        String packageName = input.getString("packageName");
        PackageInfo info = getPackageManager().getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
        if (info.applicationInfo == null || info.signingInfo == null) throw new SecurityException("PACKAGE_IDENTITY_MISSING");
        Signature[] signers = info.signingInfo.getApkContentsSigners();
        if (signers == null || signers.length != 1) throw new SecurityException("AMBIGUOUS_PACKAGE_SIGNER");
        String signer = hex(MessageDigest.getInstance("SHA-256").digest(signers[0].toByteArray()));
        if (!signer.equals(input.getString("signingDigest"))) throw new SecurityException("SIGNER_MISMATCH");
        if (info.getLongVersionCode() != input.getLong("versionCode")) throw new SecurityException("VERSION_MISMATCH");
        ComponentManifest.Kind kind = ComponentManifest.Kind.valueOf(input.getString("kind"));
        JSONArray declared = input.getJSONArray("permissions");
        if (declared.length() == 0 || declared.length() > 16) throw new IllegalArgumentException("INVALID_PERMISSIONS");
        List<String> permissions = new ArrayList<>();
        for (int i = 0; i < declared.length(); i++) permissions.add(declared.getString(i));
        return new ComponentManifest(kind, input.getString("componentId"), packageName,
            info.getLongVersionCode(), input.getInt("apiMin"), input.getInt("apiMax"),
            info.applicationInfo.uid, ComponentManifest.expectedDomain(kind), signer, permissions,
            input.getInt("dataSchemaMin"), input.getInt("dataSchemaMax"));
    }

    private Result createBackup(String owner, String requestId) throws Exception {
        byte[] encrypted = EncryptedBackup.seal(platform().exportBackup(owner), backupKey(), new SecureRandom());
        File directory = new File(getNoBackupFilesDir(), "platform-backups");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("BACKUP_DIRECTORY");
        String id = Engine.digest(owner + ":" + requestId).substring(0, 32) + ".rkb";
        File target = new File(directory, id);
        File pending = new File(directory, id + ".pending");
        if (target.isFile()) {
            byte[] prior;
            try (FileInputStream input = new FileInputStream(target)) { prior = input.readAllBytes(); }
            return new Result(id, hex(MessageDigest.getInstance("SHA-256").digest(prior)));
        }
        try (FileOutputStream output = new FileOutputStream(pending)) {
            output.write(encrypted); output.getFD().sync();
        }
        if (!pending.renameTo(target)) throw new IllegalStateException("BACKUP_COMMIT_FAILED");
        return new Result(id, hex(MessageDigest.getInstance("SHA-256").digest(encrypted)));
    }

    private static SecretKey backupKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }

    private interface Operation { Result run() throws Exception; }
    private static final class Result {
        final String id; final String digest;
        Result(String id, String digest) { this.id = id; this.digest = digest; }
    }
}
