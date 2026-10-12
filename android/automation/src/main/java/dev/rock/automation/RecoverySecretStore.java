package dev.rock.automation;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/** Keeps the owner recovery entropy local, encrypted by a separate non-exportable Keystore key. */
final class RecoverySecretStore {
    private static final String FORMAT = "avocadoos-recovery-secret-store/1";
    private static final String DEFAULT_ALIAS = "avocadoos-backup-recovery-secret-v2";
    private static final String DEFAULT_FILE = "backup-recovery-v2.secret";
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private final AtomicFile file;
    private final String alias;

    RecoverySecretStore(Context context) {
        this(context, DEFAULT_ALIAS, DEFAULT_FILE);
    }

    RecoverySecretStore(Context context, String alias, String fileName) {
        if (context == null || alias == null || fileName == null || alias.isEmpty() || fileName.isEmpty()) {
            throw new IllegalArgumentException("RECOVERY_STORE_CONFIG");
        }
        File directory = new File(context.getNoBackupFilesDir(), "recovery");
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IllegalStateException("RECOVERY_STORE_DIRECTORY");
        }
        this.file = new AtomicFile(new File(directory, fileName));
        this.alias = alias;
    }

    synchronized boolean isConfigured() {
        try { return file.getBaseFile().isFile() && keyStore().containsAlias(alias); }
        catch (Exception unavailable) { return false; }
    }

    synchronized void bind(byte[] recoverySecret, String owner) throws Exception {
        if (recoverySecret == null || recoverySecret.length != 32) {
            throw new IllegalArgumentException("INVALID_RECOVERY_SECRET");
        }
        SecretKey key = key();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new SecureRandom());
        byte[] nonce = cipher.getIV();
        if (nonce == null || nonce.length != NONCE_BYTES) throw new IllegalStateException("RECOVERY_STORE_NONCE");
        cipher.updateAAD(aad(owner));
        byte[] encrypted = cipher.doFinal(recoverySecret);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.writeUTF(FORMAT);
            output.writeUTF(owner);
            output.writeInt(nonce.length); output.write(nonce);
            output.writeInt(encrypted.length); output.write(encrypted);
        }
        FileOutputStream pending = null;
        try {
            pending = file.startWrite();
            pending.write(bytes.toByteArray());
            pending.getFD().sync();
            file.finishWrite(pending);
        } catch (Exception failure) {
            if (pending != null) file.failWrite(pending);
            throw failure;
        }
    }

    synchronized byte[] load(String owner) throws Exception {
        if (!isConfigured()) throw new IllegalStateException("RECOVERY_SETUP_REQUIRED");
        byte[] stored = file.readFully();
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(stored))) {
            if (!FORMAT.equals(input.readUTF()) || !owner.equals(input.readUTF())) {
                throw new SecurityException("RECOVERY_STORE_OWNER_MISMATCH");
            }
            int nonceLength = input.readInt();
            if (nonceLength != NONCE_BYTES) throw new IllegalArgumentException("RECOVERY_STORE_FORMAT");
            byte[] nonce = input.readNBytes(nonceLength);
            int encryptedLength = input.readInt();
            if (encryptedLength != 48 || input.available() != encryptedLength) {
                throw new IllegalArgumentException("RECOVERY_STORE_FORMAT");
            }
            byte[] encrypted = input.readNBytes(encryptedLength);
            if (input.available() != 0) throw new IllegalArgumentException("RECOVERY_STORE_TRAILING_BYTES");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(aad(owner));
            byte[] secret = cipher.doFinal(encrypted);
            if (secret.length != 32) {
                Arrays.fill(secret, (byte) 0);
                throw new SecurityException("RECOVERY_STORE_SECRET_LENGTH");
            }
            return secret;
        }
    }

    synchronized boolean isHardwareBacked() {
        try {
            SecretKey key = key();
            SecretKeyFactory factory = SecretKeyFactory.getInstance(key.getAlgorithm(), "AndroidKeyStore");
            KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
            return info.isInsideSecureHardware();
        } catch (Exception unavailable) {
            return false;
        }
    }

    private SecretKey key() throws Exception {
        KeyStore store = keyStore();
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .setUnlockedDeviceRequired(true)
            .build());
        return generator.generateKey();
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return store;
    }

    private static byte[] aad(String owner) {
        if (owner == null || owner.isEmpty()) throw new IllegalArgumentException("INVALID_BACKUP_OWNER");
        return (FORMAT + "\0" + owner).getBytes(StandardCharsets.UTF_8);
    }
}
