package dev.rock.core;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;

/**
 * Sky Compute Grid SKU {@code text-lexical-embedding-v1}.
 *
 * <p>Integer-only byte n-gram feature hashing: 256 signed 8-bit values per item. The normative
 * description is the specification text in {@code lib/sky-compute-grid-skus.ts}; its SHA-256
 * digests are the three artifact digests below. This class, the TypeScript reference and any
 * other implementation must reproduce
 * {@code contracts/sky-compute-grid-lexical-embedding-vectors.json} byte for byte, because the
 * coordinator accepts a result only when it equals the reference computation or the result of
 * another device.
 */
public final class ComputeGridLexicalEmbedding {
    public static final String SKU_ID = "text-lexical-embedding-v1";
    public static final int DIMENSIONS = 256;
    public static final String RUNTIME_ARTIFACT_SHA256 =
        "2b83ef14061ea53c5825cede9ee7e79f953ad10f86815bc41bcc11a9a3832c2a";
    public static final String MODEL_SHA256 =
        "10e63d0a4ed7f16a5c42b0c806787b4aba61fa5930e86e79610daa028800d3d5";
    public static final String TOKENIZER_SHA256 =
        "0148e10d32030fbaee7eedf967db70a3b7665da854faeb0f87ecd8e3659381a5";

    private ComputeGridLexicalEmbedding() { }

    /** Lone surrogates encode differently on Android and V8, so the coordinator never sends them. */
    public static boolean wellFormed(String value) {
        if (value == null) return false;
        for (int index = 0; index < value.length(); index++) {
            char unit = value.charAt(index);
            if (Character.isHighSurrogate(unit)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) return false;
                index++;
            } else if (Character.isLowSurrogate(unit)) return false;
        }
        return true;
    }

    /** One 256-byte vector per item, concatenated in order ({@code i8-vectors/1}). */
    public static byte[] embed(String[] items) {
        if (items == null || items.length < 1) throw new IllegalArgumentException("COMPUTE_LOT_INPUT_INVALID");
        byte[] output = new byte[Math.multiplyExact(items.length, DIMENSIONS)];
        int[] counts = new int[DIMENSIONS];
        for (int itemIndex = 0; itemIndex < items.length; itemIndex++) {
            if (!wellFormed(items[itemIndex])) throw new IllegalArgumentException("COMPUTE_LOT_INPUT_INVALID");
            byte[] bytes = items[itemIndex].getBytes(StandardCharsets.UTF_8);
            Arrays.fill(counts, 0);
            for (int gram = 2; gram <= 4; gram++) {
                for (int start = 0; start + gram <= bytes.length; start++) {
                    // FNV-1a (32 bit) over [gram length, gram bytes], then the murmur3 finaliser.
                    int hash = (0x811c9dc5 ^ gram) * 0x01000193;
                    for (int offset = 0; offset < gram; offset++)
                        hash = (hash ^ (bytes[start + offset] & 0xff)) * 0x01000193;
                    hash ^= hash >>> 16;
                    hash *= 0x85ebca6b;
                    hash ^= hash >>> 13;
                    hash *= 0xc2b2ae35;
                    hash ^= hash >>> 16;
                    counts[hash & 0xff] += ((hash >>> 8) & 1) == 1 ? -1 : 1;
                }
            }
            int maximum = 0;
            for (int count : counts) maximum = Math.max(maximum, Math.abs(count));
            if (maximum == 0) continue;
            int base = itemIndex * DIMENSIONS;
            for (int index = 0; index < DIMENSIONS; index++) {
                int count = counts[index];
                // Round |count| * 127 / maximum half up, in integers only.
                int magnitude = (Math.abs(count) * 254 + maximum) / (2 * maximum);
                output[base + index] = (byte) (count < 0 ? -magnitude : magnitude);
            }
        }
        return output;
    }

    /**
     * Host parity harness: each argument is one item as base64 UTF-8; prints the base64 output.
     * No filesystem, network, shell, or execution of input.
     */
    public static void main(String[] args) {
        try {
            String[] items = new String[args.length];
            for (int index = 0; index < args.length; index++)
                items[index] = new String(Base64.getDecoder().decode(args[index]), StandardCharsets.UTF_8);
            System.out.print(Base64.getEncoder().encodeToString(embed(items)));
        } catch (RuntimeException invalid) {
            System.err.print("INVALID_INPUT");
            System.exit(2);
        }
    }
}
