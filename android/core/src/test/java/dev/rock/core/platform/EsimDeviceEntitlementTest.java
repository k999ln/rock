package dev.rock.core.platform;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class EsimDeviceEntitlementTest {
    private static final String OWNER = "owner-1";
    private static final String ORDER = "order-1";
    private static final String PROFILE = "a".repeat(64);
    private static final String INSTALL_HASH = "b".repeat(64);
    private static final String PACK_HASH = "c".repeat(64);

    private static class TestKey implements EsimDeviceEntitlement.Es256DeviceKey {
        final KeyPair pair;
        final boolean hardwareBacked;
        final boolean revoked;
        int signCalls;
        TestKey(boolean hardwareBacked, boolean revoked) throws Exception {
            this(generatePair("secp256r1"), hardwareBacked, revoked);
        }
        TestKey(KeyPair pair, boolean hardwareBacked, boolean revoked) {
            this.pair = pair;
            this.hardwareBacked = hardwareBacked;
            this.revoked = revoked;
        }
        @Override public String authorityId() { return "oem-fixture"; }
        @Override public String keyId() { return "p256-key-1"; }
        @Override public boolean hardwareBacked() { return hardwareBacked; }
        @Override public boolean revoked() { return revoked; }
        @Override public java.security.PublicKey publicKey() { return pair.getPublic(); }
        @Override public byte[] signDer(byte[] message) throws Exception {
            signCalls++;
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(pair.getPrivate());
            signer.update(message);
            return signer.sign();
        }
    }

    private static EsimDeviceEntitlement.Challenge challenge(long expiry) {
        return new EsimDeviceEntitlement.Challenge(OWNER, ORDER, PROFILE, "challenge-1",
            "n".repeat(43), expiry, "pixel-10-device", INSTALL_HASH, "lifeline", "1.0.0", PACK_HASH);
    }

    private static EsimDeviceEntitlement.InstalledProfileEvidence evidence(
            String owner, String order, String profile, String device, String receiptHash,
            boolean verified, boolean enabled) {
        return new EsimDeviceEntitlement.InstalledProfileEvidence(owner, order, profile,
            device, receiptHash, verified, enabled);
    }

    @Test public void signsExactHardwareKeyReceiptAndProducesWebCryptoRawSignature() throws Exception {
        TestKey key = new TestKey(true, false);
        EsimDeviceEntitlement.Receipt receipt = EsimDeviceEntitlement.sign(challenge(1_800_000_060_000L),
            evidence(OWNER, ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, true, true), key, 1_800_000_000_000L);
        assertEquals("ES256", json(receipt.toJson()).getString("signatureAlgorithm"));
        assertEquals("installed_enabled", json(receipt.toJson()).getString("activationState"));
        assertEquals(1, key.signCalls);
        byte[] rawSignature = Base64.getUrlDecoder().decode(receipt.signature);
        assertEquals(64, rawSignature.length);
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(key.publicKey());
        verifier.update(EsimDeviceEntitlement.signingBytes(receipt));
        assertTrue(verifier.verify(p1363ToDer(rawSignature)));
        byte[] rawPoint = uncompressedPoint((ECPublicKey) key.publicKey());
        assertEquals(65, rawPoint.length);
        assertEquals(4, rawPoint[0]);
    }

    @Test public void javaCanonicalBytesMatchTheSharedWebCryptoVector() throws Exception {
        JSONObject vector;
        try (InputStream input = getClass().getResourceAsStream("/esim-device-entitlement-p256-vector.json")) {
            assertNotNull(input);
            vector = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        EsimDeviceEntitlement.Challenge challenge = new EsimDeviceEntitlement.Challenge(
            OWNER, ORDER, PROFILE, "challenge-1", vector.getString("challengeNonce"),
            vector.getLong("challengeExpiresAt"), "pixel-10-device", INSTALL_HASH,
            "lifeline", "1.0.0", PACK_HASH);
        EsimDeviceEntitlement.Receipt receipt = EsimDeviceEntitlement.sign(challenge,
            evidence(OWNER, ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, true, true),
            new TestKey(true, false), vector.getLong("now"));
        byte[] signingBytes = EsimDeviceEntitlement.signingBytes(receipt);
        String actualPayload = new String(signingBytes, "rock-esim-device-entitlement-signature/1\0".length(),
            signingBytes.length - "rock-esim-device-entitlement-signature/1\0".getBytes(StandardCharsets.UTF_8).length,
            StandardCharsets.UTF_8);
        assertEquals(vector.getString("expectedCanonicalPayload"), actualPayload);
    }

    @Test public void refusesUnverifiedInactiveMismatchedOrExpiredInstallEvidenceBeforeSigning() throws Exception {
        TestKey key = new TestKey(true, false);
        EsimDeviceEntitlement.Challenge challenge = challenge(1_800_000_060_000L);
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge,
            evidence(OWNER, ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, false, true), key, 1_800_000_000_000L));
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge,
            evidence(OWNER, ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, true, false), key, 1_800_000_000_000L));
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge,
            evidence("owner-2", ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, true, true), key, 1_800_000_000_000L));
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge,
            evidence(OWNER, ORDER, PROFILE, "other-device", INSTALL_HASH, true, true), key, 1_800_000_000_000L));
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge,
            evidence(OWNER, ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, true, true), key, 1_800_000_060_000L));
        assertEquals(0, key.signCalls);
    }

    @Test public void refusesSoftwareAndRevokedKeysBeforeSigning() throws Exception {
        EsimDeviceEntitlement.InstalledProfileEvidence evidence = evidence(OWNER, ORDER, PROFILE,
            "pixel-10-device", INSTALL_HASH, true, true);
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge(1_800_000_060_000L),
            evidence, new TestKey(false, false), 1_800_000_000_000L));
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge(1_800_000_060_000L),
            evidence, new TestKey(true, true), 1_800_000_000_000L));
    }

    @Test public void rejectsMalformedChallengeValuesAndNonP256Keys() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> new EsimDeviceEntitlement.Challenge(
            OWNER, ORDER, "not-a-hash", "challenge-1", "n".repeat(43), 1_800_000_060_000L,
            "pixel-10-device", INSTALL_HASH, "lifeline", "1.0.0", PACK_HASH));
        assertThrows(IllegalArgumentException.class, () -> new EsimDeviceEntitlement.Challenge(
            OWNER, ORDER, PROFILE, "challenge-1", "n".repeat(42), 1_800_000_060_000L,
            "pixel-10-device", INSTALL_HASH, "lifeline", "1.0.0", PACK_HASH));
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp384r1"));
        KeyPair pair = generator.generateKeyPair();
        assertEquals(384, ((ECPublicKey) pair.getPublic()).getParams().getCurve().getField().getFieldSize());
        EsimDeviceEntitlement.Es256DeviceKey key = new TestKey(pair, true, false);
        assertThrows(SecurityException.class, () -> EsimDeviceEntitlement.sign(challenge(1_800_000_060_000L),
            evidence(OWNER, ORDER, PROFILE, "pixel-10-device", INSTALL_HASH, true, true), key, 1_800_000_000_000L));
    }

    private static JSONObject json(String source) { return new JSONObject(source); }

    private static KeyPair generatePair(String curve) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec(curve));
        return generator.generateKeyPair();
    }

    private static byte[] uncompressedPoint(ECPublicKey key) {
        byte[] result = new byte[65]; result[0] = 4;
        byte[] x = fixed32(key.getW().getAffineX().toByteArray());
        byte[] y = fixed32(key.getW().getAffineY().toByteArray());
        System.arraycopy(x, 0, result, 1, 32); System.arraycopy(y, 0, result, 33, 32);
        return result;
    }

    private static byte[] fixed32(byte[] value) {
        int offset = value.length > 32 && value[0] == 0 ? value.length - 32 : 0;
        byte[] result = new byte[32];
        System.arraycopy(value, offset, result, 32 - (value.length - offset), value.length - offset);
        return result;
    }

    private static byte[] p1363ToDer(byte[] raw) {
        byte[] r = derInteger(Arrays.copyOfRange(raw, 0, 32));
        byte[] s = derInteger(Arrays.copyOfRange(raw, 32, 64));
        byte[] result = new byte[6 + r.length + s.length];
        int cursor = 0; result[cursor++] = 0x30; result[cursor++] = (byte) (result.length - 2);
        result[cursor++] = 0x02; result[cursor++] = (byte) r.length; System.arraycopy(r, 0, result, cursor, r.length); cursor += r.length;
        result[cursor++] = 0x02; result[cursor++] = (byte) s.length; System.arraycopy(s, 0, result, cursor, s.length);
        return result;
    }

    private static byte[] derInteger(byte[] raw) {
        int offset = 0; while (offset < raw.length - 1 && raw[offset] == 0) offset++;
        boolean prefix = (raw[offset] & 0x80) != 0;
        byte[] result = new byte[raw.length - offset + (prefix ? 1 : 0)];
        System.arraycopy(raw, offset, result, prefix ? 1 : 0, raw.length - offset);
        return result;
    }
}
