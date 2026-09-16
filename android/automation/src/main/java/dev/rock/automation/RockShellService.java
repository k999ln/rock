package dev.rock.automation;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import dev.rock.core.Engine;
import dev.rock.core.platform.EncryptedBackup;
import dev.rock.core.platform.PlatformApi;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.RecoveryPhrase;
import dev.rock.sdk.ArticlePayload;
import dev.rock.shellapi.IShellApi;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Exact-package UI bridge. The shell never opens the Broker database or Keystore directly. */
public final class RockShellService extends Service {
    static final String SHELL_PACKAGE = "dev.rock.shell";
    private static final int MAX_SNAPSHOT_WORKS = 25;
    private static final long RECOVERY_SETUP_MS = 10 * 60 * 1000L;
    private final Object zemaLock = new Object();
    private static final Object recoveryLock = new Object();
    /** Survives short bind/unbind cycles but never survives a Broker process restart. */
    private static PendingRecoverySetup pendingRecovery;

    private final IShellApi.Stub binder = new IShellApi.Stub() {
        @Override public int getApiVersion() { enforceShellCaller(); return 4; }
        @Override public String snapshot() throws android.os.RemoteException {
            enforceShellCaller();
            try { return snapshotJson(); }
            catch (RuntimeException error) { throw new android.os.RemoteException("SNAPSHOT_FAILED"); }
        }
        @Override public String submit(String requestId, String inputJson, boolean sample, boolean consent) {
            enforceShellCaller(); ArticlePayload.parse(inputJson);
            String id = engine().submit(requestId, inputJson, sample, consent); Scheduler.schedule(RockShellService.this); return id;
        }
        @Override public void setPaused(boolean paused) {
            enforceShellCaller(); engine().setPaused(paused);
            if (paused) Scheduler.stop(RockShellService.this); else Scheduler.schedule(RockShellService.this);
        }
        @Override public String result(String workId) { enforceShellCaller(); validWorkId(workId); return engine().result(workId); }
        @Override public void complete(String workId, String note) { enforceShellCaller(); validWorkId(workId); engine().complete(workId, note); }
        @Override public void retry(String workId) { enforceShellCaller(); validWorkId(workId); engine().retry(workId); Scheduler.schedule(RockShellService.this); }
        @Override public void cancel(String workId) { enforceShellCaller(); validWorkId(workId); engine().cancel(workId); }
        @Override public String localAiStatus() throws android.os.RemoteException {
            enforceShellCaller();
            try { return new LocalAiConnection(RockShellService.this).status(); }
            catch (Exception error) { throw new android.os.RemoteException("LOCAL_AI_UNAVAILABLE"); }
        }
        @Override public String submitZema(String requestId, String selectionToken, String prompt,
                String contextJson, boolean consent) {
            enforceShellCaller();
            try {
                synchronized (zemaLock) {
                    String id = new ZemaOrchestrator(RockShellService.this, engine())
                        .submit(requestId, selectionToken, prompt, contextJson, consent);
                    Scheduler.schedule(RockShellService.this);
                    return zemaResponse("queued", null, id);
                }
            } catch (SecurityException denied) {
                String reason = denied.getMessage();
                String code;
                if ("LOCAL_ARTIFACT_CONSENT_REQUIRED".equals(reason)) code = "DENIED";
                else if ("SKY_SELECTION_REQUIRED".equals(reason)
                        || "SKY_SELECTION_MISMATCH".equals(reason))
                    code = "SKY_SELECTION_REQUIRED";
                else if ("ZEMA_TOOL_SUBSTITUTION".equals(reason)
                        || "LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL".equals(reason))
                    code = "INVALID_PLAN";
                else code = "LOCAL_AI_UNAVAILABLE";
                return zemaResponse("blocked", code, null);
            } catch (IllegalArgumentException invalid) {
                return zemaResponse("blocked", "INVALID_PLAN", null);
            } catch (Exception failed) {
                return zemaResponse("blocked", "LOCAL_AI_UNAVAILABLE", null);
            }
        }
        @Override public String skySelection() {
            enforceShellCaller(); return skySelectionResponse(engine().skySelection());
        }
        @Override public String selectSkyTool(String toolId) {
            enforceShellCaller(); return skySelectionResponse(engine().selectSkyTool(toolId));
        }
        @Override public String recoveryStatus() {
            enforceShellCaller(); return recoveryStatusResponse();
        }
        @Override public String beginRecoverySetup() {
            enforceShellCaller(); return beginRecoverySetupResponse();
        }
        @Override public String confirmRecoverySetup(String setupToken, String confirmationsJson) {
            enforceShellCaller(); return confirmRecoverySetupResponse(setupToken, confirmationsJson);
        }
        @Override public String createRecoverableBackup(String requestId,
                ParcelFileDescriptor destination) {
            enforceShellCaller();
            synchronized (recoveryLock) {
                try {
                    RecoverableBackupManager.ExportResult result = backupManager().exportTo(
                        requestId, AndroidOwner.current(RockShellService.this), destination);
                    JSONObject response = new JSONObject();
                    response.put("status", "exported"); response.put("requestId", result.requestId);
                    response.put("bytes", result.bytes); response.put("sha256", result.sha256);
                    response.put("hardwareBacked", result.hardwareBacked);
                    response.put("storageSyncConfirmed", result.storageSyncConfirmed);
                    return boundedJson(response);
                } catch (Exception failure) {
                    android.util.Log.e("avocadoOS.Backup", "Export failed: "
                        + failure.getClass().getSimpleName());
                    return recoveryFailure("BACKUP_EXPORT_FAILED");
                }
            }
        }
        @Override public String restoreRecoverableBackup(ParcelFileDescriptor source,
                String recoveryPhrase) {
            enforceShellCaller();
            synchronized (recoveryLock) {
                try {
                    PlatformStore.RestoreSummary result = backupManager().restoreFrom(source,
                        recoveryPhrase, AndroidOwner.current(RockShellService.this));
                    JSONObject response = new JSONObject(); response.put("status", "restored");
                    response.put("works", result.works);
                    response.put("ledgerEntries", result.ledgerEntries);
                    response.put("stoppedApprovals", result.stoppedApprovals);
                    response.put("paused", true);
                    return boundedJson(response);
                } catch (SecurityException denied) {
                    return recoveryFailure("RECOVERY_PHRASE_OR_OWNER_REJECTED");
                } catch (Exception failure) {
                    android.util.Log.e("avocadoOS.Backup", "Restore failed: "
                        + failure.getClass().getSimpleName());
                    return recoveryFailure("BACKUP_RESTORE_FAILED");
                }
            }
        }
    };

    @Override public IBinder onBind(Intent intent) { return binder; }
    private Engine engine() { return ((RockApplication) getApplication()).engine(); }
    private RecoverableBackupManager backupManager() { return new RecoverableBackupManager(this); }

    private void enforceShellCaller() {
        int uid = Binder.getCallingUid();
        String[] names = getPackageManager().getPackagesForUid(uid);
        if (names == null || names.length != 1 || !SHELL_PACKAGE.equals(names[0]))
            throw new SecurityException("UNTRUSTED_SHELL_UID");
        if (getPackageManager().checkSignatures(getPackageName(), SHELL_PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_SHELL_SIGNER");
        try {
            if (getPackageManager().getPackageInfo(SHELL_PACKAGE, 0).getLongVersionCode() != 1)
                throw new SecurityException("UNAPPROVED_SHELL_VERSION");
        } catch (PackageManager.NameNotFoundException missing) {
            throw new SecurityException("SHELL_NOT_INSTALLED");
        }
    }

    private String snapshotJson() {
        try {
            JSONObject root = new JSONObject(); root.put("apiVersion", 1); root.put("paused", engine().paused());
            List<Map<String,String>> workItems = engine().list();
            root.put("totalWorkCount", workItems.size());
            root.put("truncated", workItems.size() > MAX_SNAPSHOT_WORKS);
            JSONArray works = new JSONArray();
            for (int index = 0; index < Math.min(workItems.size(), MAX_SNAPSHOT_WORKS); index++) {
                Map<String,String> work = workItems.get(index);
                JSONObject item = new JSONObject();
                item.put("id", work.get("id")); item.put("state", work.get("state")); item.put("sample", "1".equals(work.get("sample")));
                JSONArray runs = new JSONArray();
                for (Map<String,String> run : engine().runs(work.get("id"))) {
                    JSONObject step = new JSONObject();
                    step.put("tool", run.get("tool")); step.put("state", run.get("state"));
                    step.put("attempt", Integer.parseInt(run.get("attempt")));
                    step.put("error", run.get("error") == null ? JSONObject.NULL : run.get("error"));
                    runs.put(step);
                }
                item.put("runs", runs); works.put(item);
            }
            root.put("works", works); String result = root.toString(); Engine.bounded(result); return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("SNAPSHOT_JSON", invalid);
        }
    }

    private static void validWorkId(String value) {
        if (value == null || !value.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("INVALID_WORK_ID");
    }

    private static String zemaResponse(String status, String code, String workId) {
        try {
            JSONObject response = new JSONObject();
            response.put("status", status);
            response.put("code", code == null ? JSONObject.NULL : code);
            response.put("workId", workId == null ? JSONObject.NULL : workId);
            String result = response.toString();
            Engine.bounded(result);
            return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("ZEMA_RESPONSE_JSON", invalid);
        }
    }

    private static String skySelectionResponse(Engine.SkySelection selection) {
        try {
            JSONObject response = new JSONObject();
            response.put("status", selection == null ? "none" : "selected");
            response.put("selectionToken", selection == null ? JSONObject.NULL : selection.token);
            response.put("toolId", selection == null ? JSONObject.NULL : selection.toolId);
            response.put("revision", selection == null ? JSONObject.NULL : selection.revision);
            String result = response.toString(); Engine.bounded(result); return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("SKY_SELECTION_JSON", invalid);
        }
    }

    private String recoveryStatusResponse() {
        synchronized (recoveryLock) {
            try {
                RecoverableBackupManager manager = backupManager();
                JSONObject response = new JSONObject(); response.put("status", "ok");
                response.put("configured", manager.recoverySecrets().isConfigured());
                response.put("recoverySecretHardwareBacked",
                    manager.recoverySecrets().isHardwareBacked());
                response.put("deviceWrapHardwareBacked", manager.deviceKeyHardwareBacked());
                response.put("format", PlatformApi.RECOVERABLE_BACKUP_FORMAT);
                response.put("walletSeed", false);
                return boundedJson(response);
            } catch (Exception failure) { return recoveryFailure("RECOVERY_STATUS_FAILED"); }
        }
    }

    private String beginRecoverySetupResponse() {
        synchronized (recoveryLock) {
            clearPendingRecovery();
            try {
                SecureRandom random = new SecureRandom();
                byte[] secret = EncryptedBackup.generateRecoverySecret(random);
                String phrase = RecoveryPhrase.encode(secret);
                Set<Integer> chosen = new LinkedHashSet<>();
                while (chosen.size() < 4) chosen.add(random.nextInt(RecoveryPhrase.WORD_COUNT));
                int[] challenge = chosen.stream().mapToInt(Integer::intValue).sorted().toArray();
                String token = UUID.randomUUID().toString();
                pendingRecovery = new PendingRecoverySetup(token, secret, challenge,
                    android.os.SystemClock.elapsedRealtime() + RECOVERY_SETUP_MS);
                new android.os.Handler(getMainLooper()).postDelayed(() -> {
                    synchronized (recoveryLock) {
                        if (pendingRecovery != null &&
                            MessageDigestSafe.equals(token, pendingRecovery.token)) {
                            clearPendingRecovery();
                        }
                    }
                }, RECOVERY_SETUP_MS);
                JSONArray requested = new JSONArray();
                for (int index : challenge) requested.put(index + 1);
                JSONObject response = new JSONObject(); response.put("status", "confirmation_required");
                response.put("setupToken", token); response.put("phrase", phrase);
                response.put("confirmWordNumbers", requested); response.put("walletSeed", false);
                response.put("expiresInSeconds", RECOVERY_SETUP_MS / 1000);
                return boundedJson(response);
            } catch (Exception failure) {
                clearPendingRecovery();
                return recoveryFailure("RECOVERY_SETUP_FAILED");
            }
        }
    }

    private String confirmRecoverySetupResponse(String token, String confirmationsJson) {
        synchronized (recoveryLock) {
            try {
                if (pendingRecovery == null || token == null ||
                    !MessageDigestSafe.equals(token, pendingRecovery.token) ||
                    android.os.SystemClock.elapsedRealtime() >= pendingRecovery.expiresAtElapsed) {
                    clearPendingRecovery();
                    return recoveryFailure("RECOVERY_SETUP_EXPIRED");
                }
                JSONArray confirmations = new JSONArray(confirmationsJson);
                if (confirmations.length() != pendingRecovery.challenge.length) {
                    return recoveryFailure("RECOVERY_CONFIRMATION_MISMATCH");
                }
                String phrase = RecoveryPhrase.encode(pendingRecovery.secret);
                for (int index = 0; index < pendingRecovery.challenge.length; index++) {
                    String expected = RecoveryPhrase.wordAt(phrase, pendingRecovery.challenge[index]);
                    String actual = confirmations.optString(index, "").trim().toLowerCase(java.util.Locale.ROOT);
                    if (!MessageDigestSafe.equals(expected, actual)) {
                        return recoveryFailure("RECOVERY_CONFIRMATION_MISMATCH");
                    }
                }
                RecoverableBackupManager manager = backupManager();
                manager.recoverySecrets().bind(pendingRecovery.secret,
                    AndroidOwner.current(RockShellService.this));
                boolean hardware = manager.recoverySecrets().isHardwareBacked();
                clearPendingRecovery();
                JSONObject response = new JSONObject(); response.put("status", "configured");
                response.put("recoverySecretHardwareBacked", hardware);
                response.put("walletSeed", false);
                return boundedJson(response);
            } catch (Exception failure) {
                return recoveryFailure("RECOVERY_SETUP_FAILED");
            }
        }
    }

    private void clearPendingRecovery() {
        if (pendingRecovery != null) {
            Arrays.fill(pendingRecovery.secret, (byte) 0);
            pendingRecovery = null;
        }
    }

    private static String recoveryFailure(String code) {
        try {
            JSONObject response = new JSONObject(); response.put("status", "blocked");
            response.put("code", code); return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String boundedJson(JSONObject value) {
        String result = value.toString(); Engine.bounded(result); return result;
    }

    private static final class PendingRecoverySetup {
        final String token; final byte[] secret; final int[] challenge;
        final long expiresAtElapsed;
        PendingRecoverySetup(String token, byte[] secret, int[] challenge, long expiresAtElapsed) {
            this.token = token; this.secret = secret; this.challenge = challenge;
            this.expiresAtElapsed = expiresAtElapsed;
        }
    }

    /** Avoids data-dependent early exit for setup token and recovery word comparisons. */
    private static final class MessageDigestSafe {
        static boolean equals(String left, String right) {
            if (left == null || right == null) return false;
            return java.security.MessageDigest.isEqual(
                left.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                right.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }
}
