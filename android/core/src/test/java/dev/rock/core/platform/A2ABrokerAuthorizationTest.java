package dev.rock.core.platform;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class A2ABrokerAuthorizationTest {
    private static final byte[] RFC8032_SEED = hex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
    private static final byte[] PKCS8_PREFIX = hex("302e020100300506032b657004220420");

    @SuppressWarnings("unchecked")
    @Test public void producesTheExactCloudCompatibleQuoteBoundBrokerProof() throws Exception {
        JSONObject root;
        try (InputStream input = A2ABrokerAuthorizationTest.class.getResourceAsStream("/a2a-broker-authorization-v2.json")) {
            assertNotNull(input);
            root = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        JSONObject intentJson = root.getJSONObject("intent");
        A2ABrokerAuthorization.Intent intent = new A2ABrokerAuthorization.Intent(
            intentJson.getString("ownerUserId"), intentJson.getString("id"), intentJson.getString("parentJobId"),
            intentJson.getString("messageId"), intentJson.getString("targetOrigin"),
            intentJson.getString("targetAgentName"), intentJson.getString("targetAgentVersion"),
            intentJson.getString("protocolVersion"), intentJson.getString("budgetCurrency"), "fixture-price-1",
            intentJson.getLong("budgetLimitMinor"), intentJson.getLong("parentBudgetLimitMinor"),
            intentJson.getBoolean("continueWhileDeviceOffline"), intentJson.getLong("deadlineAt"),
            intentJson.getString("message"), intentJson.getString("priceQuoteDigest"));
        long now = root.getJSONObject("proof").getLong("issuedAt");
        PrivateKey privateKey = KeyFactory.getInstance("Ed25519").generatePrivate(
            new PKCS8EncodedKeySpec(concat(PKCS8_PREFIX, RFC8032_SEED)));
        Map<String,Object> proof = A2ABrokerAuthorization.create(intent, "fixture-rockstaros", "device-a",
            "fixture-device-key", now, bytes -> {
                Signature signer = Signature.getInstance("Ed25519");
                signer.initSign(privateKey); signer.update(bytes); return signer.sign();
            });
        JSONObject expected = root.getJSONObject("proof");
        assertEquals(expected.getString("inputSha256"), proof.get("inputSha256"));
        assertEquals(expected.getString("authorizationSha256"), proof.get("authorizationSha256"));
        assertEquals(expected.getString("authorizationSha256"), A2ABrokerAuthorization.authorizationSha256(intent));
        assertEquals(expected.getString("signature"), proof.get("signature"));
        byte[] signingBytes = A2ABrokerAuthorization.signingBytes(proof);
        assertEquals("4367aaa4121c8cbbdfad6bce5e425fccd792f748f56d2cc808e18cad376ddb0b",
            hex(MessageDigest.getInstance("SHA-256").digest(signingBytes)));
    }

    private static byte[] concat(byte[] first, byte[] second) {
        byte[] result = Arrays.copyOf(first, first.length + second.length);
        System.arraycopy(second, 0, result, first.length, second.length);
        return result;
    }
    private static byte[] hex(String value) {
        byte[] result = new byte[value.length() / 2];
        for (int i = 0; i < result.length; i++) result[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return result;
    }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }
}
