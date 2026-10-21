package dev.rock.core.platform;

import java.util.Arrays;
import java.util.Base64;

/** Validates the public fields copied from the authenticated eSIM enrollment challenge. */
public final class EsimGatewayEnrollmentChallenge {
    public static final String AUTHORITY_ID = "android-key-attestation-google";
    public static final String KEY_ID_RULE = "sha256-of-uncompressed-p256-public-key";
    public static final String APPLICATION_PACKAGE = "dev.rock.automation";
    public static final long MAX_TTL_MS = 5 * 60_000L;
    private static final long CLOCK_SKEW_MS = 30_000L;

    private EsimGatewayEnrollmentChallenge() {}

    /** Return fresh nonce bytes suitable for Android Key Attestation, or reject the input. */
    public static byte[] validateAndDecodeNonce(String challengeId, String nonce,
            long expiresAt, String authorityId, String keyIdRule, String applicationPackage,
            long now) {
        if (challengeId == null || !challengeId.matches(
                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"))
            throw new IllegalArgumentException("ESIM_ENROLLMENT_CHALLENGE_ID_INVALID");
        if (nonce == null || !nonce.matches("[A-Za-z0-9_-]{43}"))
            throw new IllegalArgumentException("ESIM_ENROLLMENT_NONCE_INVALID");
        final byte[] bytes;
        try { bytes = Base64.getUrlDecoder().decode(nonce); }
        catch (IllegalArgumentException malformed) {
            throw new IllegalArgumentException("ESIM_ENROLLMENT_NONCE_INVALID", malformed);
        }
        if (bytes.length != 32 || !Base64.getUrlEncoder().withoutPadding()
                .encodeToString(bytes).equals(nonce) || allZero(bytes)) {
            Arrays.fill(bytes, (byte) 0);
            throw new IllegalArgumentException("ESIM_ENROLLMENT_NONCE_INVALID");
        }
        if (now <= 0 || expiresAt <= now || expiresAt > now + MAX_TTL_MS + CLOCK_SKEW_MS) {
            Arrays.fill(bytes, (byte) 0);
            throw new IllegalArgumentException("ESIM_ENROLLMENT_CHALLENGE_EXPIRED_OR_INVALID");
        }
        if (!AUTHORITY_ID.equals(authorityId) || !KEY_ID_RULE.equals(keyIdRule) ||
                !APPLICATION_PACKAGE.equals(applicationPackage)) {
            Arrays.fill(bytes, (byte) 0);
            throw new IllegalArgumentException("ESIM_ENROLLMENT_AUTHORITY_INVALID");
        }
        return bytes;
    }

    private static boolean allZero(byte[] value) {
        int combined = 0;
        for (byte item : value) combined |= item;
        return combined == 0;
    }
}
