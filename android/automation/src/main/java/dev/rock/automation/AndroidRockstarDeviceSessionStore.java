package dev.rock.automation;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import dev.rock.core.platform.RockstarDeviceAuthorizationFlow;
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
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** No-backup, AndroidKeyStore-encrypted storage for the opaque Rockstar device session. */
final class AndroidRockstarDeviceSessionStore implements RockstarDeviceAuthorizationFlow.SessionStore {
    private static final String FORMAT = "rockstar-device-session-store/2";
    private static final String ALIAS = "rockstar-device-session-aes-v1";
    private static final String FILE_NAME = "rockstar-device-session-v2.bin";
    private static final Pattern TOKEN = Pattern.compile("rock_session_[A-Za-z0-9_-]{43}");
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    // Binder calls create separate store objects for the same file. AtomicFile supplies no lock.
    private static final Object STORAGE_LOCK = new Object();
    private final AtomicFile file;
    private final String packageName;
    private final String serviceOrigin;
    private final KeySource keySource;

    interface KeySource { SecretKey key() throws Exception; }

    AndroidRockstarDeviceSessionStore(Context context, String origin) {
        this(context, origin, null);
    }

    AndroidRockstarDeviceSessionStore(Context context, String origin, AtomicFile storage) {
        if (context == null) throw new IllegalArgumentException("DEVICE_SESSION_CONTEXT_REQUIRED");
        String canonical = AndroidRockstarDeviceAuthorizationTransport.canonicalOrigin(origin);
        if (origin.length() > 255 || !canonical.equals(origin))
            throw new IllegalArgumentException("DEVICE_SESSION_ORIGIN_INVALID");
        Context app = context.getApplicationContext();
        this.packageName = app.getPackageName();
        this.serviceOrigin = origin;
        File directory = new File(app.getNoBackupFilesDir(), "account");
        if (!directory.isDirectory() && !directory.mkdirs())
            throw new IllegalStateException("DEVICE_SESSION_DIRECTORY");
        this.file = storage == null ? new AtomicFile(new File(directory, FILE_NAME)) : storage;
        this.keySource = AndroidRockstarDeviceSessionStore::key;
    }

    AndroidRockstarDeviceSessionStore(AtomicFile storage, String packageName, String origin, KeySource keySource) {
        String canonical = AndroidRockstarDeviceAuthorizationTransport.canonicalOrigin(origin);
        if (origin.length() > 255 || !canonical.equals(origin))
            throw new IllegalArgumentException("DEVICE_SESSION_ORIGIN_INVALID");
        this.file = java.util.Objects.requireNonNull(storage);
        this.packageName = java.util.Objects.requireNonNull(packageName);
        this.serviceOrigin = origin;
        this.keySource = java.util.Objects.requireNonNull(keySource);
    }

    @Override public void save(String accessToken, long expiresAt, String ownerUserId) throws java.io.IOException {
        synchronized (STORAGE_LOCK) { saveLocked(accessToken, expiresAt, ownerUserId); }
    }

    private void saveLocked(String accessToken, long expiresAt, String ownerUserId) throws java.io.IOException {
        if (accessToken == null || !TOKEN.matcher(accessToken).matches() ||
                !validOwnerId(ownerUserId) ||
                expiresAt <= System.currentTimeMillis() ||
                expiresAt - System.currentTimeMillis() > 90L * 24 * 60 * 60_000L)
            throw new java.io.IOException("DEVICE_SESSION_INVALID");
        if (load() != null) throw new java.io.IOException("DEVICE_SESSION_ALREADY_LINKED");
        byte[] plaintext = null;
        byte[] encrypted = null;
        byte[] envelopeBytes = null;
        byte[] committed = null;
        FileOutputStream pending = null;
        try {
            ByteArrayOutputStream clear = new ByteArrayOutputStream();
            try (DataOutputStream data = new DataOutputStream(clear)) {
                data.writeUTF(FORMAT);
                data.writeUTF(packageName);
                data.writeUTF(serviceOrigin);
                data.writeLong(expiresAt);
                data.writeUTF(ownerUserId);
                data.writeUTF(accessToken);
            }
            plaintext = clear.toByteArray();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keySource.key(), new SecureRandom());
            cipher.updateAAD(aad());
            byte[] nonce = cipher.getIV();
            if (nonce == null || nonce.length != NONCE_BYTES) throw new java.io.IOException("DEVICE_SESSION_NONCE_INVALID");
            encrypted = cipher.doFinal(plaintext);
            ByteArrayOutputStream envelope = new ByteArrayOutputStream();
            try (DataOutputStream data = new DataOutputStream(envelope)) {
                data.writeUTF(FORMAT);
                data.writeInt(nonce.length); data.write(nonce);
                data.writeInt(encrypted.length); data.write(encrypted);
            }
            envelopeBytes = envelope.toByteArray();
            pending = file.startWrite();
            pending.write(envelopeBytes);
            pending.getFD().sync();
            file.finishWrite(pending);
            pending = null;
            // AtomicFile.finishWrite logs rename failures instead of throwing them.
            committed = file.readFully();
            if (!java.security.MessageDigest.isEqual(envelopeBytes, committed))
                throw new java.io.IOException("DEVICE_SESSION_COMMIT_UNCONFIRMED");
        } catch (Exception failure) {
            if (pending != null) file.failWrite(pending);
            if (failure instanceof java.io.IOException) throw (java.io.IOException) failure;
            throw new java.io.IOException("DEVICE_SESSION_STORE_FAILED", failure);
        } finally {
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
            if (encrypted != null) Arrays.fill(encrypted, (byte) 0);
            if (envelopeBytes != null) Arrays.fill(envelopeBytes, (byte) 0);
            if (committed != null) Arrays.fill(committed, (byte) 0);
        }
    }

    String authorizationHeader() throws java.io.IOException {
        synchronized (STORAGE_LOCK) {
            Session session = load();
            return session == null ? null : "Bearer " + session.token;
        }
    }

    long activeExpiry() throws java.io.IOException {
        synchronized (STORAGE_LOCK) {
            Session session = load();
            return session == null ? 0 : session.expiresAt;
        }
    }

    String ownerUserId() throws java.io.IOException {
        synchronized (STORAGE_LOCK) {
            Session session = load();
            return session == null ? null : session.ownerUserId;
        }
    }

    void clearLocal() {
        synchronized (STORAGE_LOCK) { file.delete(); }
    }

    void clearIfAuthorizationMatches(String authorization) throws java.io.IOException {
        synchronized (STORAGE_LOCK) {
            Session current = load();
            if (current == null || authorization == null ||
                    !java.security.MessageDigest.isEqual(("Bearer " + current.token).getBytes(StandardCharsets.UTF_8),
                        authorization.getBytes(StandardCharsets.UTF_8))) return;
            file.delete();
            if (file.getBaseFile().exists()) throw new java.io.IOException("DEVICE_SESSION_DELETE_UNCONFIRMED");
        }
    }

    private Session load() throws java.io.IOException {
        if (!file.getBaseFile().isFile()) return null;
        byte[] envelope = null;
        byte[] encrypted = null;
        byte[] plaintext = null;
        try {
            envelope = file.readFully();
            if (envelope.length > 4_096) throw new InvalidSessionException("DEVICE_SESSION_FILE_TOO_LARGE");
            byte[] nonce;
            try (DataInputStream data = new DataInputStream(new ByteArrayInputStream(envelope))) {
                if (!FORMAT.equals(data.readUTF())) throw new java.io.IOException("DEVICE_SESSION_FORMAT");
                int nonceLength = data.readInt();
                if (nonceLength != NONCE_BYTES) throw new java.io.IOException("DEVICE_SESSION_NONCE_INVALID");
                nonce = data.readNBytes(nonceLength);
                int encryptedLength = data.readInt();
                if (encryptedLength < 32 || encryptedLength > 2_048 || data.available() != encryptedLength)
                    throw new java.io.IOException("DEVICE_SESSION_CIPHERTEXT_INVALID");
                encrypted = data.readNBytes(encryptedLength);
            } catch (java.io.IOException malformed) {
                throw new InvalidSessionException(malformed);
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySource.key(), new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(aad());
            plaintext = cipher.doFinal(encrypted);
            try (DataInputStream data = new DataInputStream(new ByteArrayInputStream(plaintext))) {
                if (!FORMAT.equals(data.readUTF()) || !packageName.equals(data.readUTF()) ||
                        !serviceOrigin.equals(data.readUTF())) throw new java.io.IOException("DEVICE_SESSION_BINDING_MISMATCH");
                long expiresAt = data.readLong();
                String ownerUserId = data.readUTF();
                String token = data.readUTF();
                if (data.available() != 0 || !TOKEN.matcher(token).matches() ||
                        !validOwnerId(ownerUserId) ||
                        expiresAt - System.currentTimeMillis() > 90L * 24 * 60 * 60_000L)
                    throw new java.io.IOException("DEVICE_SESSION_CONTENT_INVALID");
                if (expiresAt <= System.currentTimeMillis()) { file.delete(); return null; }
                return new Session(token, expiresAt, ownerUserId);
            } catch (java.io.IOException malformed) {
                throw new InvalidSessionException(malformed);
            }
        } catch (Exception failure) {
            // A locked device or a transient storage/Keystore failure is not revocation.
            // Refuse this operation, but preserve the account for a later unlocked read.
            if (failure instanceof InvalidSessionException || failure instanceof javax.crypto.AEADBadTagException ||
                    failure instanceof android.security.keystore.KeyPermanentlyInvalidatedException)
                file.delete();
            if (failure instanceof java.io.IOException) throw (java.io.IOException) failure;
            throw new java.io.IOException("DEVICE_SESSION_READ_FAILED", failure);
        } finally {
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
            if (encrypted != null) Arrays.fill(encrypted, (byte) 0);
            if (envelope != null) Arrays.fill(envelope, (byte) 0);
        }
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .setUnlockedDeviceRequired(true)
            .build());
        return generator.generateKey();
    }

    private byte[] aad() {
        return (FORMAT + "\0" + packageName + "\0" + serviceOrigin).getBytes(StandardCharsets.UTF_8);
    }

    private static boolean validOwnerId(String value) {
        if (value == null || value.isEmpty() || value.length() > 256) return false;
        for (int index = 0; index < value.length(); index++) {
            int code = value.charAt(index);
            if (code < 32 || code == 127) return false;
        }
        return true;
    }

    private static final class InvalidSessionException extends java.io.IOException {
        InvalidSessionException(String message) { super(message); }
        InvalidSessionException(java.io.IOException cause) { super(cause.getMessage(), cause); }
    }

    private static final class Session {
        final String token;
        final long expiresAt;
        final String ownerUserId;
        Session(String token, long expiresAt, String ownerUserId) {
            this.token = token; this.expiresAt = expiresAt; this.ownerUserId = ownerUserId;
        }
    }
}
