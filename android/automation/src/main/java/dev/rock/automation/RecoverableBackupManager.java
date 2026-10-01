package dev.rock.automation;

import android.content.Context;
import android.os.ParcelFileDescriptor;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import dev.rock.core.Engine;
import dev.rock.core.platform.EncryptedBackup;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.RecoveryPhrase;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;

/** Broker-only v2 backup creation, bounded file transport and replacement-device restoration. */
final class RecoverableBackupManager {
    private static final String DEVICE_WRAP_ALIAS = "avocadoos-backup-device-wrap-v2";
    private static final int MAX_ENVELOPE_BYTES = EncryptedBackup.MAX_PLAINTEXT_BYTES + 4096;
    private final Context context;
    private final RecoverySecretStore recoverySecrets;

    RecoverableBackupManager(Context context) {
        this.context = context;
        this.recoverySecrets = new RecoverySecretStore(context);
    }

    RecoverySecretStore recoverySecrets() { return recoverySecrets; }

    byte[] createBytes(String owner) throws Exception {
        RockApplication app = (RockApplication) context.getApplicationContext();
        app.engine();
        byte[] secret = recoverySecrets.load(owner);
        byte[] plaintext = null;
        try {
            plaintext = app.platform().exportRecoverableState(owner);
            return EncryptedBackup.sealRecoverable(plaintext, deviceWrapKey(), secret, owner,
                System.currentTimeMillis(), new SecureRandom());
        } finally {
            Arrays.fill(secret, (byte) 0);
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    ExportResult exportTo(String requestId, String owner, ParcelFileDescriptor destination)
        throws Exception {
        if (requestId == null || !requestId.matches("[A-Za-z0-9:._-]{1,160}") || destination == null) {
            throw new IllegalArgumentException("INVALID_BACKUP_EXPORT");
        }
        byte[] envelope = createBytes(owner);
        boolean syncConfirmed = true;
        try (FileOutputStream output =
                 new ParcelFileDescriptor.AutoCloseOutputStream(destination)) {
            output.write(envelope); output.flush();
            try { output.getFD().sync(); }
            catch (java.io.SyncFailedException providerDoesNotSupportSync) { syncConfirmed = false; }
        }
        return new ExportResult(requestId, envelope.length, sha256(envelope),
            deviceKeyHardwareBacked(), syncConfirmed);
    }

    PlatformStore.RestoreSummary restoreFrom(ParcelFileDescriptor source, String phrase,
        String owner) throws Exception {
        if (source == null) throw new IllegalArgumentException("BACKUP_FILE_REQUIRED");
        byte[] envelope;
        try (FileInputStream input =
                 new ParcelFileDescriptor.AutoCloseInputStream(source)) {
            envelope = boundedRead(input);
        }
        byte[] secret = RecoveryPhrase.decode(phrase);
        byte[] plaintext = null;
        try {
            plaintext = EncryptedBackup.openWithRecoverySecret(envelope, secret, owner);
            RockApplication app = (RockApplication) context.getApplicationContext();
            app.engine();
            PlatformStore platform = app.platform();
            platform.requireEmptyRecoverableRestoreTarget(owner);
            recoverySecrets.bind(secret, owner);
            return platform.restoreRecoverableState(plaintext, owner, System.currentTimeMillis());
        } finally {
            Arrays.fill(secret, (byte) 0);
            Arrays.fill(envelope, (byte) 0);
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    boolean deviceKeyHardwareBacked() {
        try {
            SecretKey key = deviceWrapKey();
            SecretKeyFactory factory = SecretKeyFactory.getInstance(key.getAlgorithm(), "AndroidKeyStore");
            KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
            return info.isInsideSecureHardware();
        } catch (Exception unavailable) { return false; }
    }

    private static byte[] boundedRead(FileInputStream input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (bytes.size() > MAX_ENVELOPE_BYTES - count) {
                throw new IllegalArgumentException("BACKUP_FILE_TOO_LARGE");
            }
            bytes.write(buffer, 0, count);
        }
        byte[] result = bytes.toByteArray();
        if (result.length == 0) throw new IllegalArgumentException("BACKUP_FILE_EMPTY");
        return result;
    }

    private static SecretKey deviceWrapKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(DEVICE_WRAP_ALIAS)) {
            return (SecretKey) store.getKey(DEVICE_WRAP_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(DEVICE_WRAP_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .setUnlockedDeviceRequired(true)
            .build());
        return generator.generateKey();
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder value = new StringBuilder(digest.length * 2);
        for (byte item : digest) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }

    static final class ExportResult {
        final String requestId, sha256;
        final int bytes;
        final boolean hardwareBacked, storageSyncConfirmed;
        ExportResult(String requestId, int bytes, String sha256, boolean hardwareBacked,
            boolean storageSyncConfirmed) {
            this.requestId = requestId; this.bytes = bytes; this.sha256 = sha256;
            this.hardwareBacked = hardwareBacked;
            this.storageSyncConfirmed = storageSyncConfirmed;
        }
    }
}
