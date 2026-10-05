package dev.rock.core.platform;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class A2AUsageReceiptVerifierTest {
    private static final String ORIGIN = "https://agent.example";
    private static final byte[] PUBLIC_KEY = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");

    @SuppressWarnings("unchecked")
    private static Map<String, Object> receipt() throws Exception {
        try (InputStream input = A2AUsageReceiptVerifierTest.class.getResourceAsStream("/a2a-usage-receipt-v1.json")) {
            assertNotNull(input);
            byte[] bytes = input.readAllBytes();
            return deepMap(new JSONObject(new String(bytes, StandardCharsets.UTF_8)).toMap());
        }
    }

    private static Map<String, Object> deepMap(Map<String, Object> source) {
        Map<String, Object> result = new HashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof Map<?, ?>) {
                Map<String, Object> nested = new HashMap<>();
                ((Map<?, ?>) value).forEach((key, item) -> nested.put(String.valueOf(key), item));
                value = deepMap(nested);
            } else if (value instanceof List<?>) {
                List<Object> items = new ArrayList<>();
                for (Object item : (List<?>) value) {
                    if (item instanceof Map<?, ?>) {
                        Map<String, Object> nested = new HashMap<>();
                        ((Map<?, ?>) item).forEach((key, nestedValue) -> nested.put(String.valueOf(key), nestedValue));
                        items.add(deepMap(nested));
                    } else items.add(item);
                }
                value = items;
            }
            result.put(entry.getKey(), value);
        }
        return result;
    }

    private static A2AUsageReceiptVerifier verifier() {
        return new A2AUsageReceiptVerifier(List.of(
            new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, PUBLIC_KEY, false)));
    }

    private static A2AUsageReceiptVerifier.Hold hold() {
        return new A2AUsageReceiptVerifier.Hold("alice", "zema-job-1", "a2a-job-1", "remote-task-1",
            ORIGIN, "Research Agent", "1.0.0", "USD", "fixture-price-1", 1_000,
            1_799_000_000_000L, 1_800_000_000_000L);
    }

    @Test public void verifiesTheSharedCloudAndPythonSigningVectorAndExactHoldBinding() throws Exception {
        Map<String, Object> receipt = receipt();
        byte[] signingBytes = A2AUsageReceiptVerifier.signingBytes(receipt);
        assertEquals("d07b4129081a85123aa233c8b7639e9654986a4d0b204def4cad0dd6b833ac75",
            hex(MessageDigest.getInstance("SHA-256").digest(signingBytes)));
        assertTrue(verifier().verify(receipt, hold(), 1_800_000_000_000L).matches("[a-f0-9]{64}"));

        Map<String, Object> wrongOwner = new HashMap<>(receipt);
        wrongOwner.put("ownerUserId", "bob");
        assertThrows(SecurityException.class, () -> verifier().verify(wrongOwner, hold(), 1_800_000_000_000L));
        A2AUsageReceiptVerifier.Hold wrongTask = new A2AUsageReceiptVerifier.Hold("alice", "zema-job-1", "a2a-job-1",
            "other-task", ORIGIN, "Research Agent", "1.0.0", "USD", "fixture-price-1", 1_000,
            1_799_000_000_000L, 1_800_000_000_000L);
        assertThrows(SecurityException.class, () -> verifier().verify(receipt, wrongTask, 1_800_000_000_000L));
        Map<String, Object> wrongAmount = new HashMap<>(receipt);
        wrongAmount.put("amountMinor", 651L);
        assertThrows(SecurityException.class, () -> verifier().verify(wrongAmount, hold(), 1_800_000_000_000L));
        assertThrows(SecurityException.class, () -> verifier().verify(receipt, hold(), 1_799_000_000_000L));
    }

    @Test public void rejectsUnknownRevokedMalformedAndOverBudgetProviderKeys() throws Exception {
        Map<String, Object> receipt = receipt();
        A2AUsageReceiptVerifier noKeys = new A2AUsageReceiptVerifier(List.of());
        assertThrows(SecurityException.class, () -> noKeys.verify(receipt, hold(), 1_800_000_000_000L));
        A2AUsageReceiptVerifier revoked = new A2AUsageReceiptVerifier(List.of(
            new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, PUBLIC_KEY, true)));
        assertThrows(SecurityException.class, () -> revoked.verify(receipt, hold(), 1_800_000_000_000L));
        assertThrows(IllegalArgumentException.class, () ->
            new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, new byte[31], false));
        assertThrows(IllegalArgumentException.class, () ->
            new A2AUsageReceiptVerifier(List.of(
                new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, PUBLIC_KEY, false),
                new A2AUsageReceiptVerifier.TrustedKey("provider-x", "usage-key-1", ORIGIN, PUBLIC_KEY, false))));
        assertThrows(SecurityException.class, () -> verifier().verify(receipt,
            new A2AUsageReceiptVerifier.Hold("alice", "zema-job-1", "a2a-job-1", "remote-task-1",
                ORIGIN, "Research Agent", "1.0.0", "USD", "fixture-price-1", 649,
                1_799_000_000_000L, 1_800_000_000_000L),
            1_800_000_000_000L));
    }

    @Test public void verifiesTheSharedSignedPriceQuoteAndBindsItsExactIntent() throws Exception {
        Map<String, Object> quote;
        try (InputStream input = A2AUsageReceiptVerifierTest.class.getResourceAsStream("/a2a-price-quote-v1.json")) {
            assertNotNull(input);
            quote = deepMap(new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8)).toMap());
        }
        A2AUsageReceiptVerifier verifier = new A2AUsageReceiptVerifier(List.of(
            new A2AUsageReceiptVerifier.TrustedKey("provider-a", "key-1", "https://agent.example.com", PUBLIC_KEY, false)));
        A2AUsageReceiptVerifier.PriceQuoteIntent intent = new A2AUsageReceiptVerifier.PriceQuoteIntent(
            "https://agent.example.com", "Research Agent", "2.1.0", "a".repeat(64), "USD", 900);
        byte[] signingBytes = A2AUsageReceiptVerifier.priceQuoteSigningBytes(quote);
        assertEquals("9ca4537c42d9cbcc26b214aae683d5115fb2e18dec863d86e7ad7c1cdc4da964",
            hex(MessageDigest.getInstance("SHA-256").digest(signingBytes)));
        assertEquals("9ca4537c42d9cbcc26b214aae683d5115fb2e18dec863d86e7ad7c1cdc4da964",
            verifier.verifyPriceQuote(quote, intent, 2_000));

        Map<String, Object> tampered = new HashMap<>(quote);
        tampered.put("estimateMinor", 450L);
        assertThrows(SecurityException.class, () -> verifier.verifyPriceQuote(tampered, intent, 2_000));
        assertThrows(SecurityException.class, () -> verifier.verifyPriceQuote(quote,
            new A2AUsageReceiptVerifier.PriceQuoteIntent("https://agent.example.com", "Research Agent",
                "2.1.0", "c".repeat(64), "USD", 900), 2_000));
        assertThrows(SecurityException.class, () -> verifier.verifyPriceQuote(quote, intent, 10_000));
        assertThrows(SecurityException.class, () -> verifier.verifyPriceQuote(quote,
            new A2AUsageReceiptVerifier.PriceQuoteIntent("https://agent.example.com", "Research Agent",
                "2.1.0", "a".repeat(64), "USD", 599), 2_000));
    }

    @Test public void mapsProviderRemoteTaskIdThroughTheStablePreDispatchDelegationId() throws Exception {
        Map<String,Object> receipt = receipt();
        A2AUsageReceiptVerifier.Hold preDispatch = new A2AUsageReceiptVerifier.Hold(
            "alice", "zema-job-1", "a2a-job-1", "a2a-job-1", ORIGIN,
            "Research Agent", "1.0.0", "USD", "fixture-price-1", 1_000,
            1_799_000_000_000L, 1_800_000_000_000L);
        assertTrue(verifier().verify(receipt, preDispatch, 1_800_000_000_000L).matches("[a-f0-9]{64}"));
        Map<String,Object> anotherDelegation = new HashMap<>(receipt);
        anotherDelegation.put("delegationId", "a2a-job-2");
        assertThrows(SecurityException.class,
            () -> verifier().verify(anotherDelegation, preDispatch, 1_800_000_000_000L));
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
