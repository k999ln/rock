package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** AES-GCM envelope. Android callers must supply a non-exportable Keystore key. */
public final class EncryptedBackup {
    private static final byte[] MAGIC = PlatformApi.BACKUP_FORMAT.getBytes(StandardCharsets.US_ASCII);
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private EncryptedBackup() {}

    public static byte[] seal(byte[] plaintext, SecretKey key, SecureRandom random) {
        if (plaintext == null || plaintext.length == 0 || plaintext.length > 4 * 1024 * 1024) {
            throw new IllegalArgumentException("INVALID_BACKUP_SIZE");
        }
        if (key == null || random == null) throw new IllegalArgumentException("BACKUP_KEY_REQUIRED");
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(MAGIC);
            byte[] encrypted = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(2 + MAGIC.length + nonce.length + encrypted.length)
                .putShort((short) MAGIC.length).put(MAGIC).put(nonce).put(encrypted).array();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("BACKUP_ENCRYPTION_FAILED", error);
        }
    }

    public static byte[] open(byte[] envelope, SecretKey key) {
        if (envelope == null || key == null || envelope.length < 2 + MAGIC.length + NONCE_BYTES + 16) {
            throw new IllegalArgumentException("INVALID_BACKUP_ENVELOPE");
        }
        try {
            ByteBuffer buffer = ByteBuffer.wrap(envelope);
            int magicLength = Short.toUnsignedInt(buffer.getShort());
            if (magicLength != MAGIC.length || buffer.remaining() < magicLength + NONCE_BYTES + 16) {
                throw new IllegalArgumentException("UNSUPPORTED_BACKUP_FORMAT");
            }
            byte[] magic = new byte[magicLength];
            buffer.get(magic);
            if (!Arrays.equals(MAGIC, magic)) throw new IllegalArgumentException("UNSUPPORTED_BACKUP_FORMAT");
            byte[] nonce = new byte[NONCE_BYTES];
            buffer.get(nonce);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(MAGIC);
            return cipher.doFinal(encrypted);
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (GeneralSecurityException error) {
            throw new SecurityException("BACKUP_AUTHENTICATION_FAILED", error);
        }
    }
}
