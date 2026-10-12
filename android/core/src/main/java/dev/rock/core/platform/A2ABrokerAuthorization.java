package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Builds the exact Cloud A2A Broker proof, after PlatformStore confirms its quote-bound Wallet hold. */
public final class A2ABrokerAuthorization {
    public static final String SCHEMA = "rock-a2a-broker-authorization/2";
    private static final byte[] DOMAIN = "rock-a2a-broker-authorization-signature/2\0".getBytes(StandardCharsets.UTF_8);
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final long MAX_PROOF_LIFETIME_MS = 5 * 60_000L;
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9._:-]{1,128}");
    private static final Pattern HASH = Pattern.compile("[a-f0-9]{64}");

    public static final class Intent {
        public final String ownerUserId, delegationId, parentJobId, messageId;
        public final String targetOrigin, targetAgentName, targetAgentVersion, protocolVersion;
        public final String budgetCurrency, pricingVersion, requestSha256, priceQuoteDigest, message;
        public final long budgetLimitMinor, parentBudgetLimitMinor, deadlineAt;
        public final boolean continueWhileDeviceOffline;

        public Intent(String ownerUserId, String delegationId, String parentJobId, String messageId,
                      String targetOrigin, String targetAgentName, String targetAgentVersion,
                      String protocolVersion, String budgetCurrency, String pricingVersion,
                      long budgetLimitMinor, long parentBudgetLimitMinor, boolean continueWhileDeviceOffline,
                      long deadlineAt, String message, String priceQuoteDigest) {
            if (!id(ownerUserId) || !id(delegationId) || !id(parentJobId) || !id(messageId)
                || targetOrigin == null || targetOrigin.length() > 512 || !targetOrigin.startsWith("https://")
                || targetAgentName == null || targetAgentName.trim().isEmpty() || targetAgentName.length() > 128
                || hasControl(targetAgentName) || !id(targetAgentVersion) || !"1.0".equals(protocolVersion)
                || budgetCurrency == null || !budgetCurrency.matches("[A-Z]{3}") || !id(pricingVersion)
                || budgetLimitMinor < 0 || budgetLimitMinor > MAX_SAFE_INTEGER
                || parentBudgetLimitMinor < budgetLimitMinor || parentBudgetLimitMinor > MAX_SAFE_INTEGER
                || !continueWhileDeviceOffline || deadlineAt <= 0 || deadlineAt > MAX_SAFE_INTEGER
                || message == null || message.trim().isEmpty() || message.getBytes(StandardCharsets.UTF_8).length > 8_000
                || !HASH.matcher(priceQuoteDigest == null ? "" : priceQuoteDigest).matches())
                throw new IllegalArgumentException("INVALID_A2A_BROKER_AUTHORIZATION_INTENT");
            this.ownerUserId = ownerUserId; this.delegationId = delegationId; this.parentJobId = parentJobId;
            this.messageId = messageId; this.targetOrigin = targetOrigin; this.targetAgentName = targetAgentName;
            this.targetAgentVersion = targetAgentVersion; this.protocolVersion = protocolVersion;
            this.budgetCurrency = budgetCurrency; this.pricingVersion = pricingVersion;
            this.budgetLimitMinor = budgetLimitMinor; this.parentBudgetLimitMinor = parentBudgetLimitMinor;
            this.continueWhileDeviceOffline = continueWhileDeviceOffline; this.deadlineAt = deadlineAt;
            this.message = message; this.requestSha256 = Engine.digest(message); this.priceQuoteDigest = priceQuoteDigest;
        }
    }

    private A2ABrokerAuthorization() {}

    /** Package-private so callers must enter through PlatformStore's reservation check. */
    static Map<String,Object> create(Intent intent, String authorityId, String deviceRef, String keyId,
                                     long now, A2AWalletHandoffRequest.Signer signer) {
        if (intent == null || !id(authorityId) || !id(deviceRef) || !id(keyId) || now <= 0
            || now > MAX_SAFE_INTEGER || now >= intent.deadlineAt || signer == null)
            throw new IllegalArgumentException("INVALID_A2A_BROKER_AUTHORIZATION");
        long expiresAt = Math.min(now + MAX_PROOF_LIFETIME_MS, intent.deadlineAt);
        String authorizationSha256 = authorizationSha256(intent);

        Map<String,Object> proof = new LinkedHashMap<>();
        proof.put("schema", SCHEMA);
        proof.put("authorityId", authorityId);
        proof.put("ownerUserId", intent.ownerUserId);
        proof.put("deviceRef", deviceRef);
        proof.put("delegationId", intent.delegationId);
        proof.put("parentJobId", intent.parentJobId);
        proof.put("messageId", intent.messageId);
        proof.put("targetOrigin", intent.targetOrigin);
        proof.put("targetAgentName", intent.targetAgentName);
        proof.put("targetAgentVersion", intent.targetAgentVersion);
        proof.put("protocolVersion", intent.protocolVersion);
        proof.put("inputSha256", intent.requestSha256);
        proof.put("budgetCurrency", intent.budgetCurrency);
        proof.put("budgetLimitMinor", intent.budgetLimitMinor);
        proof.put("continueWhileDeviceOffline", intent.continueWhileDeviceOffline);
        proof.put("deadlineAt", intent.deadlineAt);
        proof.put("authorizationSha256", authorizationSha256);
        proof.put("issuedAt", now);
        proof.put("expiresAt", expiresAt);
        proof.put("keyId", keyId);
        try {
            byte[] signature = signer.sign(signingBytes(proof));
            if (signature == null || signature.length != 64)
                throw new SecurityException("A2A_BROKER_SIGNATURE_INVALID");
            proof.put("signature", Base64.getUrlEncoder().withoutPadding().encodeToString(signature));
            java.util.Arrays.fill(signature, (byte) 0);
            return proof;
        } catch (SecurityException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new IllegalStateException("A2A_BROKER_SIGNING_FAILED", failure);
        }
    }

    /** Cloud-compatible authorization digest used to validate a newly persisted draft before consent. */
    public static String authorizationSha256(Intent intent) {
        if (intent == null) throw new IllegalArgumentException("A2A_BROKER_INTENT_REQUIRED");
        Map<String,Object> approval = new LinkedHashMap<>();
        approval.put("ownerUserId", intent.ownerUserId);
        approval.put("id", intent.delegationId);
        approval.put("parentJobId", intent.parentJobId);
        approval.put("messageId", intent.messageId);
        approval.put("targetOrigin", intent.targetOrigin);
        approval.put("targetAgentName", intent.targetAgentName);
        approval.put("targetAgentVersion", intent.targetAgentVersion);
        approval.put("protocolVersion", intent.protocolVersion);
        approval.put("inputSha256", intent.requestSha256);
        approval.put("budgetCurrency", intent.budgetCurrency);
        approval.put("budgetLimitMinor", intent.budgetLimitMinor);
        approval.put("parentBudgetLimitMinor", intent.parentBudgetLimitMinor);
        approval.put("continueWhileDeviceOffline", intent.continueWhileDeviceOffline);
        approval.put("deadlineAt", intent.deadlineAt);
        approval.put("priceQuoteDigest", intent.priceQuoteDigest);
        return Engine.digest(A2AUsageReceiptVerifier.canonicalJson(approval));
    }

    static byte[] signingBytes(Map<String,Object> proof) {
        String[] fields = {"schema", "authorityId", "ownerUserId", "deviceRef", "delegationId", "parentJobId",
            "messageId", "targetOrigin", "targetAgentName", "targetAgentVersion", "protocolVersion",
            "inputSha256", "budgetCurrency", "budgetLimitMinor", "continueWhileDeviceOffline", "deadlineAt",
            "authorizationSha256", "issuedAt", "expiresAt", "keyId"};
        Map<String,Object> ordered = new LinkedHashMap<>();
        for (String field : fields) {
            if (!proof.containsKey(field)) throw new IllegalArgumentException("INVALID_A2A_BROKER_AUTHORIZATION");
            ordered.put(field, proof.get(field));
        }
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        byte[] json = A2AUsageReceiptVerifier.canonicalJson(ordered).getBytes(StandardCharsets.UTF_8);
        result.write(DOMAIN, 0, DOMAIN.length); result.write(json, 0, json.length);
        java.util.Arrays.fill(json, (byte) 0);
        return result.toByteArray();
    }

    private static boolean id(String value) { return value != null && IDENTIFIER.matcher(value).matches(); }
    private static boolean hasControl(String value) {
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i))) return true;
        return false;
    }
}
