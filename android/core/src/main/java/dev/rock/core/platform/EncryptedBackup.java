package dev.rock.core.platform;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Authenticated backup envelopes. Version 2 survives loss of the original Android Keystore. */
public final class EncryptedBackup {
    public static final String RECOVERABLE_FORMAT = PlatformApi.RECOVERABLE_BACKUP_FORMAT;
    public static final int RECOVERY_SECRET_BYTES = 32;
    public static final int MAX_PLAINTEXT_BYTES = 4 * 1024 * 1024;

    private static final byte[] LEGACY_MAGIC =
        PlatformApi.BACKUP_FORMAT.getBytes(StandardCharsets.US_ASCII);
    private static final byte[] RECOVERABLE_MAGIC =
        RECOVERABLE_FORMAT.getBytes(StandardCharsets.US_ASCII);
    private static final byte[] DEVICE_WRAP_CONTEXT =
        "avocadoOS backup device wrap".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] RECOVERY_WRAP_CONTEXT =
        "avocadoOS backup owner recovery wrap".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PAYLOAD_CONTEXT =
        "avocadoOS backup payload".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] HKDF_INFO_PREFIX =
        "avocadoOS\0recoverable-backup/2\0owner=".getBytes(StandardCharsets.US_ASCII);

    private static final int VERSION = 2;
    private static final int KEY_BYTES = 32;
    private static final int HASH_BYTES = 32;
    private static final int SALT_BYTES = 32;
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BYTES = 16;
    private static final int TAG_BITS = TAG_BYTES * 8;
    private static final int WRAPPED_KEY_BYTES = KEY_BYTES + TAG_BYTES;
    private static final int MAX_OWNER_BYTES = 512;

    private EncryptedBackup() {}

    /**
     * Legacy Keystore-only envelope retained solely so existing version-1 backups remain readable.
     * New callers must use {@link #sealRecoverable}.
     */
    public static byte[] seal(byte[] plaintext, SecretKey key, SecureRandom random) {
        requirePlaintext(plaintext);
        if (key == null || random == null) throw new IllegalArgumentException("BACKUP_KEY_REQUIRED");
        try {
            Cipher cipher = newEncryptCipher(key, random);
            byte[] nonce = requireNonce(cipher.getIV());
            cipher.updateAAD(LEGACY_MAGIC);
            byte[] encrypted = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(2 + LEGACY_MAGIC.length + nonce.length + encrypted.length)
                .putShort((short) LEGACY_MAGIC.length).put(LEGACY_MAGIC).put(nonce).put(encrypted).array();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("BACKUP_ENCRYPTION_FAILED", error);
        }
    }

    /** Reads a legacy Keystore-only envelope. */
    public static byte[] open(byte[] envelope, SecretKey key) {
        if (envelope == null || key == null || envelope.length < 2 + LEGACY_MAGIC.length + NONCE_BYTES + TAG_BYTES) {
            throw new IllegalArgumentException("INVALID_BACKUP_ENVELOPE");
        }
        try {
            ByteBuffer buffer = ByteBuffer.wrap(envelope);
            int magicLength = Short.toUnsignedInt(buffer.getShort());
            if (magicLength != LEGACY_MAGIC.length || buffer.remaining() < magicLength + NONCE_BYTES + TAG_BYTES) {
                throw new IllegalArgumentException("UNSUPPORTED_BACKUP_FORMAT");
            }
            byte[] magic = new byte[magicLength];
            buffer.get(magic);
            if (!Arrays.equals(LEGACY_MAGIC, magic)) {
                throw new IllegalArgumentException("UNSUPPORTED_BACKUP_FORMAT");
            }
            byte[] nonce = new byte[NONCE_BYTES];
            buffer.get(nonce);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            return decrypt(encrypted, key, nonce, LEGACY_MAGIC, null);
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (GeneralSecurityException error) {
            throw new SecurityException("BACKUP_AUTHENTICATION_FAILED", error);
        }
    }

    /** Generates the 256-bit entropy encoded by the owner-facing 24-word recovery phrase. */
    public static byte[] generateRecoverySecret(SecureRandom random) {
        if (random == null) throw new IllegalArgumentException("SECURE_RANDOM_REQUIRED");
        byte[] secret = new byte[RECOVERY_SECRET_BYTES];
        random.nextBytes(secret);
        return secret;
    }

    /**
     * Encrypts one owner-scoped snapshot under a fresh data key and wraps that data key twice:
     * once with the non-exportable device key and once with the owner's independent recovery key.
     */
    public static byte[] sealRecoverable(byte[] plaintext, SecretKey deviceKey,
        byte[] recoverySecret, String owner, long createdAtEpochMillis, SecureRandom random) {
        requirePlaintext(plaintext);
        requireRecoverySecret(recoverySecret);
        byte[] ownerDigest = ownerDigest(owner);
        if (deviceKey == null || random == null) throw new IllegalArgumentException("BACKUP_KEY_REQUIRED");
        if (createdAtEpochMillis <= 0) throw new IllegalArgumentException("INVALID_BACKUP_TIME");

        byte[] dataKeyBytes = new byte[KEY_BYTES];
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(dataKeyBytes);
        random.nextBytes(salt);
        byte[] recoveryWrapKeyBytes = null;
        try {
            SecretKey dataKey = new SecretKeySpec(dataKeyBytes, "AES");
            recoveryWrapKeyBytes = hkdfSha256(recoverySecret, salt, hkdfInfo(ownerDigest), KEY_BYTES);
            SecretKey recoveryWrapKey = new SecretKeySpec(recoveryWrapKeyBytes, "AES");

            Cipher deviceCipher = newEncryptCipher(deviceKey, random);
            Cipher recoveryCipher = newEncryptCipher(recoveryWrapKey, random);
            Cipher payloadCipher = newEncryptCipher(dataKey, random);
            byte[] deviceNonce = requireNonce(deviceCipher.getIV());
            byte[] recoveryNonce = requireNonce(recoveryCipher.getIV());
            byte[] payloadNonce = requireNonce(payloadCipher.getIV());
            int payloadLength = Math.addExact(plaintext.length, TAG_BYTES);
            byte[] header = header(createdAtEpochMillis, ownerDigest, salt, deviceNonce,
                recoveryNonce, payloadNonce, payloadLength);

            byte[] deviceWrapped = finishEncrypt(deviceCipher, dataKeyBytes, header, DEVICE_WRAP_CONTEXT);
            byte[] recoveryWrapped = finishEncrypt(recoveryCipher, dataKeyBytes, header, RECOVERY_WRAP_CONTEXT);
            byte[] encryptedPayload = finishEncrypt(payloadCipher, plaintext, header, PAYLOAD_CONTEXT);
            if (deviceWrapped.length != WRAPPED_KEY_BYTES || recoveryWrapped.length != WRAPPED_KEY_BYTES ||
                encryptedPayload.length != payloadLength) {
                throw new IllegalStateException("BACKUP_CIPHER_LENGTH_MISMATCH");
            }
            return ByteBuffer.allocate(Math.addExact(header.length,
                    Math.addExact(deviceWrapped.length, Math.addExact(recoveryWrapped.length, encryptedPayload.length))))
                .put(header).put(deviceWrapped).put(recoveryWrapped).put(encryptedPayload).array();
        } catch (GeneralSecurityException | ArithmeticException error) {
            throw new IllegalStateException("BACKUP_ENCRYPTION_FAILED", error);
        } finally {
            Arrays.fill(dataKeyBytes, (byte) 0);
            if (recoveryWrapKeyBytes != null) Arrays.fill(recoveryWrapKeyBytes, (byte) 0);
        }
    }

    /** Restores on the original device without exposing the owner recovery secret. */
    public static byte[] openWithDeviceKey(byte[] envelope, SecretKey deviceKey, String owner) {
        if (deviceKey == null) throw new IllegalArgumentException("BACKUP_KEY_REQUIRED");
        Parsed parsed = parseRecoverable(envelope, owner);
        byte[] dataKeyBytes = null;
        try {
            dataKeyBytes = decrypt(parsed.deviceWrapped, deviceKey, parsed.deviceNonce,
                parsed.header, DEVICE_WRAP_CONTEXT);
            return openPayload(parsed, dataKeyBytes);
        } catch (GeneralSecurityException error) {
            throw new SecurityException("BACKUP_AUTHENTICATION_FAILED", error);
        } finally {
            if (dataKeyBytes != null) Arrays.fill(dataKeyBytes, (byte) 0);
        }
    }

    /** Restores after wipe or device loss without the old Android Keystore. */
    public static byte[] openWithRecoverySecret(byte[] envelope, byte[] recoverySecret, String owner) {
        requireRecoverySecret(recoverySecret);
        Parsed parsed = parseRecoverable(envelope, owner);
        byte[] recoveryWrapKeyBytes = null;
        byte[] dataKeyBytes = null;
        try {
            recoveryWrapKeyBytes = hkdfSha256(recoverySecret, parsed.salt,
                hkdfInfo(parsed.ownerDigest), KEY_BYTES);
            SecretKey recoveryWrapKey = new SecretKeySpec(recoveryWrapKeyBytes, "AES");
            dataKeyBytes = decrypt(parsed.recoveryWrapped, recoveryWrapKey, parsed.recoveryNonce,
                parsed.header, RECOVERY_WRAP_CONTEXT);
            return openPayload(parsed, dataKeyBytes);
        } catch (GeneralSecurityException error) {
            throw new SecurityException("BACKUP_AUTHENTICATION_FAILED", error);
        } finally {
            if (dataKeyBytes != null) Arrays.fill(dataKeyBytes, (byte) 0);
            if (recoveryWrapKeyBytes != null) Arrays.fill(recoveryWrapKeyBytes, (byte) 0);
        }
    }

    private static byte[] openPayload(Parsed parsed, byte[] dataKeyBytes)
        throws GeneralSecurityException {
        if (dataKeyBytes.length != KEY_BYTES) throw new GeneralSecurityException("INVALID_DATA_KEY");
        SecretKey dataKey = new SecretKeySpec(dataKeyBytes, "AES");
        return decrypt(parsed.encryptedPayload, dataKey, parsed.payloadNonce,
            parsed.header, PAYLOAD_CONTEXT);
    }

    private static Parsed parseRecoverable(byte[] envelope, String owner) {
        byte[] expectedOwner = ownerDigest(owner);
        int minimum = 2 + RECOVERABLE_MAGIC.length + Integer.BYTES + Long.BYTES +
            HASH_BYTES + SALT_BYTES + 3 * NONCE_BYTES + 3 * Integer.BYTES +
            2 * WRAPPED_KEY_BYTES + TAG_BYTES;
        if (envelope == null || envelope.length < minimum) {
            throw new IllegalArgumentException("INVALID_BACKUP_ENVELOPE");
        }
        try {
            ByteBuffer input = ByteBuffer.wrap(envelope);
            int magicLength = Short.toUnsignedInt(input.getShort());
            if (magicLength != RECOVERABLE_MAGIC.length || input.remaining() < magicLength) {
                throw new IllegalArgumentException("UNSUPPORTED_BACKUP_FORMAT");
            }
            byte[] magic = new byte[magicLength];
            input.get(magic);
            if (!MessageDigest.isEqual(RECOVERABLE_MAGIC, magic) || input.getInt() != VERSION) {
                throw new IllegalArgumentException("UNSUPPORTED_BACKUP_FORMAT");
            }
            long createdAt = input.getLong();
            if (createdAt <= 0) throw new IllegalArgumentException("INVALID_BACKUP_TIME");
            byte[] actualOwner = take(input, HASH_BYTES);
            byte[] salt = take(input, SALT_BYTES);
            byte[] deviceNonce = take(input, NONCE_BYTES);
            byte[] recoveryNonce = take(input, NONCE_BYTES);
            byte[] payloadNonce = take(input, NONCE_BYTES);
            int deviceWrappedLength = input.getInt();
            int recoveryWrappedLength = input.getInt();
            int payloadLength = input.getInt();
            if (deviceWrappedLength != WRAPPED_KEY_BYTES || recoveryWrappedLength != WRAPPED_KEY_BYTES ||
                payloadLength < TAG_BYTES + 1 || payloadLength > MAX_PLAINTEXT_BYTES + TAG_BYTES) {
                throw new IllegalArgumentException("INVALID_BACKUP_LENGTH");
            }
            int headerLength = input.position();
            int bodyLength = Math.addExact(deviceWrappedLength,
                Math.addExact(recoveryWrappedLength, payloadLength));
            if (input.remaining() != bodyLength) throw new IllegalArgumentException("INVALID_BACKUP_LENGTH");
            if (!MessageDigest.isEqual(expectedOwner, actualOwner)) {
                throw new SecurityException("BACKUP_OWNER_MISMATCH");
            }
            byte[] header = Arrays.copyOf(envelope, headerLength);
            return new Parsed(header, actualOwner, salt, deviceNonce, recoveryNonce, payloadNonce,
                take(input, deviceWrappedLength), take(input, recoveryWrappedLength),
                take(input, payloadLength));
        } catch (java.nio.BufferUnderflowException | ArithmeticException error) {
            throw new IllegalArgumentException("INVALID_BACKUP_ENVELOPE", error);
        }
    }

    private static byte[] header(long createdAt, byte[] ownerDigest, byte[] salt,
        byte[] deviceNonce, byte[] recoveryNonce, byte[] payloadNonce, int payloadLength) {
        int length = 2 + RECOVERABLE_MAGIC.length + Integer.BYTES + Long.BYTES + HASH_BYTES +
            SALT_BYTES + 3 * NONCE_BYTES + 3 * Integer.BYTES;
        return ByteBuffer.allocate(length)
            .putShort((short) RECOVERABLE_MAGIC.length).put(RECOVERABLE_MAGIC).putInt(VERSION)
            .putLong(createdAt).put(ownerDigest).put(salt).put(deviceNonce).put(recoveryNonce)
            .put(payloadNonce).putInt(WRAPPED_KEY_BYTES).putInt(WRAPPED_KEY_BYTES)
            .putInt(payloadLength).array();
    }

    private static byte[] ownerDigest(String owner) {
        if (owner == null || owner.isEmpty() || !owner.equals(owner.trim())) {
            throw new IllegalArgumentException("INVALID_BACKUP_OWNER");
        }
        byte[] bytes = owner.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_OWNER_BYTES) throw new IllegalArgumentException("INVALID_BACKUP_OWNER");
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException("SHA256_UNAVAILABLE", impossible);
        }
    }

    private static byte[] hkdfInfo(byte[] ownerDigest) {
        return ByteBuffer.allocate(HKDF_INFO_PREFIX.length + ownerDigest.length)
            .put(HKDF_INFO_PREFIX).put(ownerDigest).array();
    }

    private static byte[] hkdfSha256(byte[] inputKeyMaterial, byte[] salt, byte[] info, int length)
        throws GeneralSecurityException {
        Mac extract = Mac.getInstance("HmacSHA256");
        extract.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] pseudoRandomKey = extract.doFinal(inputKeyMaterial);
        try {
            Mac expand = Mac.getInstance("HmacSHA256");
            expand.init(new SecretKeySpec(pseudoRandomKey, "HmacSHA256"));
            expand.update(info);
            expand.update((byte) 1);
            return Arrays.copyOf(expand.doFinal(), length);
        } finally {
            Arrays.fill(pseudoRandomKey, (byte) 0);
        }
    }

    private static Cipher newEncryptCipher(SecretKey key, SecureRandom random)
        throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, random);
        return cipher;
    }

    private static byte[] finishEncrypt(Cipher cipher, byte[] plaintext, byte[] header,
        byte[] context) throws GeneralSecurityException {
        cipher.updateAAD(header);
        cipher.updateAAD(context);
        return cipher.doFinal(plaintext);
    }

    private static byte[] decrypt(byte[] ciphertext, SecretKey key, byte[] nonce,
        byte[] header, byte[] context) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
        cipher.updateAAD(header);
        if (context != null) cipher.updateAAD(context);
        return cipher.doFinal(ciphertext);
    }

    private static byte[] requireNonce(byte[] nonce) {
        if (nonce == null || nonce.length != NONCE_BYTES) {
            throw new IllegalStateException("BACKUP_NONCE_LENGTH");
        }
        return nonce;
    }

    private static void requirePlaintext(byte[] plaintext) {
        if (plaintext == null || plaintext.length == 0 || plaintext.length > MAX_PLAINTEXT_BYTES) {
            throw new IllegalArgumentException("INVALID_BACKUP_SIZE");
        }
    }

    private static void requireRecoverySecret(byte[] recoverySecret) {
        if (recoverySecret == null || recoverySecret.length != RECOVERY_SECRET_BYTES) {
            throw new IllegalArgumentException("INVALID_RECOVERY_SECRET");
        }
    }

    private static byte[] take(ByteBuffer input, int length) {
        byte[] value = new byte[length];
        input.get(value);
        return value;
    }

    private static final class Parsed {
        final byte[] header;
        final byte[] ownerDigest;
        final byte[] salt;
        final byte[] deviceNonce;
        final byte[] recoveryNonce;
        final byte[] payloadNonce;
        final byte[] deviceWrapped;
        final byte[] recoveryWrapped;
        final byte[] encryptedPayload;

        Parsed(byte[] header, byte[] ownerDigest, byte[] salt, byte[] deviceNonce,
            byte[] recoveryNonce, byte[] payloadNonce, byte[] deviceWrapped,
            byte[] recoveryWrapped, byte[] encryptedPayload) {
            this.header = header;
            this.ownerDigest = ownerDigest;
            this.salt = salt;
            this.deviceNonce = deviceNonce;
            this.recoveryNonce = recoveryNonce;
            this.payloadNonce = payloadNonce;
            this.deviceWrapped = deviceWrapped;
            this.recoveryWrapped = recoveryWrapped;
            this.encryptedPayload = encryptedPayload;
        }
    }
}
