package dev.rock.core.platform;

import org.junit.Test;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import static org.junit.Assert.*;

public final class EsimGatewayEnrollmentChallengeTest {
    private static final long NOW = 1_800_000_000_000L;

    @Test public void acceptsFreshServerChallengeAndReturns32NonceBytes() {
        byte[] nonce = new byte[32]; new SecureRandom().nextBytes(nonce);
        byte[] decoded = EsimGatewayEnrollmentChallenge.validateAndDecodeNonce(
            UUID.randomUUID().toString(), Base64.getUrlEncoder().withoutPadding().encodeToString(nonce),
            NOW + 300_000L, EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE, NOW);
        assertArrayEquals(nonce, decoded);
    }

    @Test public void rejectsMalformedNonceChallengeIdentityAndExpiry() {
        assertRejects("ESIM_ENROLLMENT_NONCE_INVALID", "bad", NOW + 300_000L,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE);
        assertRejects("ESIM_ENROLLMENT_NONCE_INVALID", Base64.getUrlEncoder().withoutPadding()
            .encodeToString(new byte[31]), NOW + 300_000L,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE);
        assertRejects("ESIM_ENROLLMENT_CHALLENGE_ID_INVALID", nonce(), NOW + 300_000L,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE, "not-a-uuid");
        assertRejects("ESIM_ENROLLMENT_CHALLENGE_EXPIRED_OR_INVALID", nonce(), NOW,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE);
        assertRejects("ESIM_ENROLLMENT_CHALLENGE_EXPIRED_OR_INVALID", nonce(),
            NOW + EsimGatewayEnrollmentChallenge.MAX_TTL_MS + 30_001L,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE);
    }

    @Test public void rejectsUntrustedAuthorityKeyRuleAndApplicationPackage() {
        assertRejects("ESIM_ENROLLMENT_AUTHORITY_INVALID", nonce(), NOW + 60_000,
            "other-authority", EsimGatewayEnrollmentChallenge.KEY_ID_RULE,
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE);
        assertRejects("ESIM_ENROLLMENT_AUTHORITY_INVALID", nonce(), NOW + 60_000,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID, "caller-chosen-key-id",
            EsimGatewayEnrollmentChallenge.APPLICATION_PACKAGE);
        assertRejects("ESIM_ENROLLMENT_AUTHORITY_INVALID", nonce(), NOW + 60_000,
            EsimGatewayEnrollmentChallenge.AUTHORITY_ID,
            EsimGatewayEnrollmentChallenge.KEY_ID_RULE, "untrusted.package");
    }

    private static void assertRejects(String code, String nonce, long expiresAt,
            String authorityId, String keyIdRule, String packageName) {
        assertRejects(code, nonce, expiresAt, authorityId, keyIdRule, packageName,
            UUID.randomUUID().toString());
    }

    private static void assertRejects(String code, String nonce, long expiresAt,
            String authorityId, String keyIdRule, String packageName, String challengeId) {
        try {
            EsimGatewayEnrollmentChallenge.validateAndDecodeNonce(challengeId, nonce,
                expiresAt, authorityId, keyIdRule, packageName, NOW);
            fail("expected rejection: " + code);
        } catch (IllegalArgumentException rejected) {
            assertEquals(code, rejected.getMessage());
        }
    }

    private static String nonce() {
        byte[] value = new byte[32]; new SecureRandom().nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
