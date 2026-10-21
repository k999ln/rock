package dev.rock.core;

import dev.rock.core.platform.A2AWalletHandoffRequest;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.EdECPrivateKeySpec;
import java.security.spec.NamedParameterSpec;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class A2AWalletHandoffRequestTest {
    @SuppressWarnings("unchecked")
    @Test public void javaRequestSignatureMatchesTheCloudWebCryptoVector() throws Exception {
        JSONObject vector;
        try (InputStream input = getClass().getResourceAsStream("/a2a-wallet-handoff-request-v1.json")) {
            assertNotNull(input);
            vector = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        JSONObject expected = vector.getJSONObject("request");
        byte[] seed = hex(vector.getString("testPrivateKeySeedHex"));
        java.security.PrivateKey privateKey = KeyFactory.getInstance("Ed25519").generatePrivate(
            new EdECPrivateKeySpec(NamedParameterSpec.ED25519, seed));
        Map<String,Object> request = A2AWalletHandoffRequest.create(
            expected.getString("authorityId"), expected.getString("ownerUserId"),
            expected.getString("deviceRef"), expected.getString("delegationId"),
            expected.getString("requestId"), expected.getLong("requestedAt"),
            expected.getString("keyId"), expected.getLong("requestedAt"), bytes -> {
                Signature signer = Signature.getInstance("Ed25519");
                signer.initSign(privateKey); signer.update(bytes); return signer.sign();
            });
        assertEquals(expected.getString("signature"), request.get("signature"));
        assertEquals(vector.getString("signingBytesSha256"), hex(MessageDigest.getInstance("SHA-256")
            .digest(A2AWalletHandoffRequest.signingBytes(unsignedRequest(request)))));
        assertEquals(expected.getString("schema"), request.get("schema"));
    }

    @Test public void requestRefusesStaleIdentityAndMalformedSignature() {
        assertThrows(IllegalArgumentException.class, () -> A2AWalletHandoffRequest.create(
            "authority", "owner", "device", "delegation", "bad-uuid", 100, "key", 100,
            bytes -> new byte[64]));
        assertThrows(IllegalArgumentException.class, () -> A2AWalletHandoffRequest.create(
            "authority", "owner", "device", "123e4567-e89b-42d3-a456-426614174000",
            "123e4567-e89b-42d3-a456-426614174001", 100, "key", 100 + 5 * 60_000L + 1,
            bytes -> new byte[64]));
        assertThrows(IllegalArgumentException.class, () -> A2AWalletHandoffRequest.create(
            "authority", "owner", "device", "123e4567-e89b-42d3-a456-426614174000",
            "123e4567-e89b-42d3-a456-426614174001", 9_007_199_254_740_992L, "key",
            9_007_199_254_740_992L, bytes -> new byte[64]));
        assertThrows(IllegalArgumentException.class, () -> A2AWalletHandoffRequest.create(
            "authority", "owner", "device", "123e4567-e89b-42d3-a456-426614174000",
            "123e4567-e89b-42d3-a456-426614174001", 100, "key", 100,
            bytes -> new byte[63]));
    }

    private static Map<String,Object> unsignedRequest(Map<String,Object> signed) {
        java.util.LinkedHashMap<String,Object> copy = new java.util.LinkedHashMap<>(signed);
        copy.remove("signature");
        return copy;
    }

    private static byte[] hex(String value) {
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return out;
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format("%02x", value & 255));
        return out.toString();
    }
}
