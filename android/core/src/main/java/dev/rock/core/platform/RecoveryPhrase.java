package dev.rock.core.platform;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;

/**
 * RockstarOS-only 24-word encoding for a 256-bit backup recovery secret.
 *
 * <p>This deliberately does not use the BIP-39 word list or checksum. It must never be treated as
 * a cryptocurrency wallet seed. Thirty-two fixed prefixes and sixty-four fixed suffixes form a
 * license-free 2048-word namespace. The final eight bits are a domain-separated checksum.</p>
 */
public final class RecoveryPhrase {
    public static final int WORD_COUNT = 24;
    private static final byte[] CHECKSUM_DOMAIN =
        "avocadoOS\0backup-recovery-phrase\0v1".getBytes(StandardCharsets.US_ASCII);
    private static final String[] PREFIXES = {
        "ba", "be", "bi", "bo", "bu", "ca", "ce", "ci",
        "co", "cu", "da", "de", "di", "do", "du", "fa",
        "fe", "fi", "fo", "fu", "ga", "ge", "gi", "go",
        "gu", "ha", "he", "hi", "ho", "hu", "ja", "je"
    };
    private static final String[] SUFFIXES = {
        "lan", "len", "lin", "lon", "lun", "mar", "mer", "mir",
        "mor", "mur", "nav", "nev", "niv", "nov", "nuv", "pal",
        "pel", "pil", "pol", "pul", "ras", "res", "ris", "ros",
        "rus", "sav", "sev", "siv", "sov", "suv", "tal", "tel",
        "til", "tol", "tul", "var", "ver", "vir", "vor", "vur",
        "wan", "wen", "win", "won", "wun", "xan", "xen", "xin",
        "xon", "xun", "yan", "yen", "yin", "yon", "yun", "zal",
        "zel", "zil", "zol", "zul", "kam", "kem", "kim", "kom"
    };

    private RecoveryPhrase() {}

    public static String encode(byte[] recoverySecret) {
        requireSecret(recoverySecret);
        byte[] encoded = Arrays.copyOf(recoverySecret, recoverySecret.length + 1);
        encoded[encoded.length - 1] = checksum(recoverySecret);
        try {
            StringBuilder phrase = new StringBuilder(WORD_COUNT * 6);
            for (int word = 0; word < WORD_COUNT; word++) {
                int value = 0;
                for (int bit = 0; bit < 11; bit++) {
                    int offset = word * 11 + bit;
                    value = (value << 1) |
                        ((encoded[offset / 8] >>> (7 - (offset % 8))) & 1);
                }
                if (word != 0) phrase.append(' ');
                phrase.append(PREFIXES[value >>> 6]).append(SUFFIXES[value & 63]);
            }
            return phrase.toString();
        } finally {
            Arrays.fill(encoded, (byte) 0);
        }
    }

    public static byte[] decode(String phrase) {
        if (phrase == null) throw new IllegalArgumentException("RECOVERY_PHRASE_REQUIRED");
        String normalized = phrase.trim().toLowerCase(Locale.ROOT);
        String[] words = normalized.isEmpty() ? new String[0] : normalized.split("\\s+");
        if (words.length != WORD_COUNT) throw new IllegalArgumentException("RECOVERY_PHRASE_WORD_COUNT");
        byte[] encoded = new byte[EncryptedBackup.RECOVERY_SECRET_BYTES + 1];
        try {
            for (int word = 0; word < words.length; word++) {
                int value = wordIndex(words[word]);
                for (int bit = 0; bit < 11; bit++) {
                    int offset = word * 11 + bit;
                    int selected = (value >>> (10 - bit)) & 1;
                    encoded[offset / 8] |= selected << (7 - (offset % 8));
                }
            }
            byte[] secret = Arrays.copyOf(encoded, EncryptedBackup.RECOVERY_SECRET_BYTES);
            byte[] expected = {checksum(secret)};
            byte[] actual = {encoded[encoded.length - 1]};
            if (!MessageDigest.isEqual(expected, actual)) {
                Arrays.fill(secret, (byte) 0);
                throw new SecurityException("RECOVERY_PHRASE_CHECKSUM");
            }
            return secret;
        } finally {
            Arrays.fill(encoded, (byte) 0);
        }
    }

    public static String wordAt(String phrase, int zeroBasedIndex) {
        if (zeroBasedIndex < 0 || zeroBasedIndex >= WORD_COUNT) {
            throw new IllegalArgumentException("RECOVERY_WORD_INDEX");
        }
        String[] words = phrase.trim().toLowerCase(Locale.ROOT).split("\\s+");
        if (words.length != WORD_COUNT) throw new IllegalArgumentException("RECOVERY_PHRASE_WORD_COUNT");
        wordIndex(words[zeroBasedIndex]);
        return words[zeroBasedIndex];
    }

    private static int wordIndex(String word) {
        if (word == null || word.length() != 5) throw new IllegalArgumentException("UNKNOWN_RECOVERY_WORD");
        int prefix = indexOf(PREFIXES, word.substring(0, 2));
        int suffix = indexOf(SUFFIXES, word.substring(2));
        if (prefix < 0 || suffix < 0) throw new IllegalArgumentException("UNKNOWN_RECOVERY_WORD");
        return (prefix << 6) | suffix;
    }

    private static int indexOf(String[] values, String target) {
        for (int index = 0; index < values.length; index++) {
            if (values[index].equals(target)) return index;
        }
        return -1;
    }

    private static byte checksum(byte[] secret) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(CHECKSUM_DOMAIN);
            return digest.digest(secret)[0];
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException("SHA256_UNAVAILABLE", impossible);
        }
    }

    private static void requireSecret(byte[] secret) {
        if (secret == null || secret.length != EncryptedBackup.RECOVERY_SECRET_BYTES) {
            throw new IllegalArgumentException("INVALID_RECOVERY_SECRET");
        }
    }
}
