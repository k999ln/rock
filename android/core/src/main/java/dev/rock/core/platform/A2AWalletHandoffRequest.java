package dev.rock.core.platform;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Exact Java counterpart of the Cloud wallet-handoff signed read request contract. */
public final class A2AWalletHandoffRequest {
    public static final String SCHEMA = "rock-a2a-wallet-handoff-request/1";
    private static final byte[] DOMAIN = "rock-a2a-wallet-handoff-request-signature/1\0"
        .getBytes(StandardCharsets.UTF_8);
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9._:-]{1,128}");
    private static final Pattern UUID_VALUE = Pattern.compile(
        "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    @FunctionalInterface
    public interface Signer {
        /** Sign with the enrolled Broker private key; private key bytes must not leave its keystore. */
        byte[] sign(byte[] message) throws Exception;
    }

    private A2AWalletHandoffRequest() {}

    public static Map<String,Object> create(String authorityId, String ownerUserId, String deviceRef,
        String delegationId, String requestId, long requestedAt, String keyId, long now, Signer signer) {
        identifier(authorityId); identifier(ownerUserId); identifier(deviceRef);
        identifier(delegationId); identifier(keyId);
        if (requestId == null || !UUID_VALUE.matcher(requestId).matches() || now <= 0 ||
            now > MAX_SAFE_INTEGER || requestedAt <= 0 || requestedAt > MAX_SAFE_INTEGER ||
            (requestedAt > now && requestedAt - now > 30_000) ||
            (requestedAt <= now && now - requestedAt > 5 * 60_000L) || signer == null)
            throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        Map<String,Object> request = new LinkedHashMap<>();
        request.put("schema", SCHEMA);
        request.put("authorityId", authorityId);
        request.put("ownerUserId", ownerUserId);
        request.put("deviceRef", deviceRef);
        request.put("delegationId", delegationId);
        request.put("requestId", requestId);
        request.put("requestedAt", requestedAt);
        request.put("keyId", keyId);
        try {
            byte[] signature = signer.sign(signingBytes(request));
            if (signature == null || signature.length != 64)
                throw new IllegalArgumentException("BROKER_SIGNATURE_INVALID");
            request.put("signature", Base64.getUrlEncoder().withoutPadding().encodeToString(signature));
            return request;
        } catch (IllegalArgumentException invalid) {
            throw invalid;
        } catch (Exception failure) {
            throw new IllegalStateException("A2A_WALLET_HANDOFF_SIGNING_FAILED", failure);
        }
    }

    /** Domain-separated ordered JSON bytes shared with lib/a2a-wallet-handoff-auth.ts. */
    public static byte[] signingBytes(Map<String,Object> request) {
        if (request == null || !request.keySet().equals(FIELDS_WITHOUT_SIGNATURE()))
            throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        String schema = text(request, "schema");
        if (!SCHEMA.equals(schema)) throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        String authority = text(request, "authorityId"); identifier(authority);
        String owner = text(request, "ownerUserId"); identifier(owner);
        String device = text(request, "deviceRef"); identifier(device);
        String delegation = text(request, "delegationId"); identifier(delegation);
        String requestId = text(request, "requestId");
        if (!UUID_VALUE.matcher(requestId).matches()) throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        Object timeValue = request.get("requestedAt");
        if (!(timeValue instanceof Number)) throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        long requestedAt = ((Number) timeValue).longValue();
        if (requestedAt <= 0 || requestedAt > MAX_SAFE_INTEGER ||
            !Double.isFinite(((Number) timeValue).doubleValue()) ||
            ((Number) timeValue).doubleValue() != requestedAt)
            throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        String keyId = text(request, "keyId"); identifier(keyId);
        String payload = "{\"schema\":\"" + SCHEMA + "\",\"authorityId\":\"" + authority +
            "\",\"ownerUserId\":\"" + owner + "\",\"deviceRef\":\"" + device +
            "\",\"delegationId\":\"" + delegation + "\",\"requestId\":\"" + requestId +
            "\",\"requestedAt\":" + requestedAt + ",\"keyId\":\"" + keyId + "\"}";
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(DOMAIN.length + payload.length());
        bytes.write(DOMAIN, 0, DOMAIN.length);
        byte[] encoded = payload.getBytes(StandardCharsets.UTF_8);
        bytes.write(encoded, 0, encoded.length);
        return bytes.toByteArray();
    }

    private static Set<String> FIELDS_WITHOUT_SIGNATURE() {
        return Set.of("schema", "authorityId", "ownerUserId", "deviceRef", "delegationId",
            "requestId", "requestedAt", "keyId");
    }

    private static String text(Map<String,Object> map, String name) {
        Object value = map.get(name);
        if (!(value instanceof String)) throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
        return (String) value;
    }

    private static void identifier(String value) {
        if (value == null || !IDENTIFIER.matcher(value).matches())
            throw new IllegalArgumentException("INVALID_A2A_WALLET_HANDOFF_REQUEST");
    }
}
