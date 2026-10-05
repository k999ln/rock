package dev.rock.core.platform;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import dev.rock.core.Engine;

/** Verifies provider-signed A2A usage receipts against an OS-owned keyset and native Wallet hold. */
public final class A2AUsageReceiptVerifier {
    private static final byte[] ED25519_X509_PREFIX = new byte[] {
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
    };
    private static final byte[] DOMAIN = "rock-a2a-provider-usage-receipt-signature/1\0".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PRICE_QUOTE_DOMAIN = "rock-a2a-provider-price-quote-signature/1\0".getBytes(StandardCharsets.UTF_8);
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9._:-]{1,128}");
    private static final Pattern CURRENCY = Pattern.compile("[A-Z]{3}");
    private static final Pattern DOMAIN_HOST = Pattern.compile("(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}");
    private static final Pattern SIGNATURE = Pattern.compile("[A-Za-z0-9_-]{86}");
    private static final List<String> FIELDS = Collections.unmodifiableList(Arrays.asList(
        "schema", "providerId", "keyId", "receiptId", "ownerUserId", "parentJobId",
        "delegationId", "taskId", "agentOrigin", "agentName", "agentVersion", "currency",
        "amountMinor", "pricingVersion", "issuedAt", "usage"));
    private static final Set<String> RECEIPT_FIELDS = Set.of(
        "schema", "providerId", "keyId", "receiptId", "ownerUserId", "parentJobId",
        "delegationId", "taskId", "agentOrigin", "agentName", "agentVersion", "currency",
        "amountMinor", "pricingVersion", "issuedAt", "usage", "signature");
    private static final List<String> PRICE_QUOTE_FIELDS = Collections.unmodifiableList(Arrays.asList(
        "schema", "providerId", "keyId", "quoteId", "agentOrigin", "agentName", "agentVersion",
        "requestSha256", "pricingVersion", "pricingSha256", "currency", "estimateMinor",
        "maxAmountMinor", "issuedAt", "expiresAt", "usage"));
    private static final Set<String> PRICE_QUOTE_ALL_FIELDS = Set.of(
        "schema", "providerId", "keyId", "quoteId", "agentOrigin", "agentName", "agentVersion",
        "requestSha256", "pricingVersion", "pricingSha256", "currency", "estimateMinor",
        "maxAmountMinor", "issuedAt", "expiresAt", "usage", "signature");
    private static final Pattern SHA256 = Pattern.compile("[a-f0-9]{64}");

    public static final class TrustedKey {
        public final String providerId;
        public final String keyId;
        public final String agentOrigin;
        public final boolean revoked;
        private final byte[] rawPublicKey;

        public TrustedKey(String providerId, String keyId, String agentOrigin,
                          byte[] rawPublicKey, boolean revoked) {
            if (!identifier(providerId) || !identifier(keyId) || !validOrigin(agentOrigin)
                || rawPublicKey == null || rawPublicKey.length != 32)
                throw new IllegalArgumentException("INVALID_A2A_USAGE_TRUST_KEY");
            this.providerId = providerId;
            this.keyId = keyId;
            this.agentOrigin = agentOrigin;
            this.rawPublicKey = rawPublicKey.clone();
            this.revoked = revoked;
        }
    }

    public static final class Hold {
        public final String ownerUserId, parentJobId, delegationId, taskId, agentOrigin;
        public final String agentName, agentVersion, currency, pricingVersion, requestSha256, priceQuoteDigest;
        public final long limitMinor, parentBudgetLimitMinor, createdAt, deadlineAt;

        public Hold(String ownerUserId, String parentJobId, String delegationId, String taskId,
                    String agentOrigin, String agentName, String agentVersion, String currency,
                    String pricingVersion, long limitMinor, long createdAt, long deadlineAt) {
            this(ownerUserId, parentJobId, delegationId, taskId, agentOrigin, agentName, agentVersion,
                currency, pricingVersion, "", "", limitMinor, limitMinor, createdAt, deadlineAt);
        }

        /** Quote-bound hold constructor used for paid A2A tasks; the quote digest enters its approval digest. */
        public Hold(String ownerUserId, String parentJobId, String delegationId, String taskId,
                    String agentOrigin, String agentName, String agentVersion, String currency,
                    String pricingVersion, String priceQuoteDigest, long limitMinor,
                    long createdAt, long deadlineAt) {
            this(ownerUserId, parentJobId, delegationId, taskId, agentOrigin, agentName, agentVersion,
                currency, pricingVersion, "", priceQuoteDigest, limitMinor, limitMinor, createdAt, deadlineAt);
        }

        /** Fully request- and quote-bound hold constructor for paid A2A work. */
        public Hold(String ownerUserId, String parentJobId, String delegationId, String taskId,
                    String agentOrigin, String agentName, String agentVersion, String currency,
                    String pricingVersion, String requestSha256, String priceQuoteDigest,
                    long limitMinor, long createdAt, long deadlineAt) {
            this(ownerUserId, parentJobId, delegationId, taskId, agentOrigin, agentName, agentVersion,
                currency, pricingVersion, requestSha256, priceQuoteDigest, limitMinor, limitMinor,
                createdAt, deadlineAt);
        }

        /** Quote-bound hold with both per-task and enclosing parent-job authorization caps. */
        public Hold(String ownerUserId, String parentJobId, String delegationId, String taskId,
                    String agentOrigin, String agentName, String agentVersion, String currency,
                    String pricingVersion, String requestSha256, String priceQuoteDigest,
                    long limitMinor, long parentBudgetLimitMinor, long createdAt, long deadlineAt) {
            if (!identifier(ownerUserId) || !identifier(parentJobId) || !identifier(delegationId)
                || !identifier(taskId) || !validOrigin(agentOrigin) || agentName == null || agentName.trim().isEmpty()
                || agentName.getBytes(StandardCharsets.UTF_8).length > 256 || agentVersion == null
                || agentVersion.trim().isEmpty() || agentVersion.getBytes(StandardCharsets.UTF_8).length > 256
                || currency == null || !CURRENCY.matcher(currency).matches() || !identifier(pricingVersion)
                || requestSha256 == null || !(requestSha256.isEmpty() || SHA256.matcher(requestSha256).matches())
                || priceQuoteDigest == null || !(priceQuoteDigest.isEmpty() || SHA256.matcher(priceQuoteDigest).matches())
                || limitMinor < 0 || limitMinor > MAX_SAFE_INTEGER || parentBudgetLimitMinor < limitMinor
                || parentBudgetLimitMinor > MAX_SAFE_INTEGER
                || createdAt < 0 || createdAt > MAX_SAFE_INTEGER
                || deadlineAt < 0 || deadlineAt > MAX_SAFE_INTEGER)
                throw new IllegalArgumentException("INVALID_A2A_WALLET_HOLD");
            this.ownerUserId = ownerUserId;
            this.parentJobId = parentJobId;
            this.delegationId = delegationId;
            this.taskId = taskId;
            this.agentOrigin = agentOrigin;
            this.agentName = agentName;
            this.agentVersion = agentVersion;
            this.currency = currency;
            this.pricingVersion = pricingVersion;
            this.requestSha256 = requestSha256;
            this.priceQuoteDigest = priceQuoteDigest;
            this.limitMinor = limitMinor;
            this.parentBudgetLimitMinor = parentBudgetLimitMinor;
            this.createdAt = createdAt;
            this.deadlineAt = deadlineAt;
        }
    }

    /** Exact task and cost terms the owner is being asked to approve before cloud dispatch. */
    public static final class PriceQuoteIntent {
        public final String agentOrigin, agentName, agentVersion, requestSha256, currency;
        public final long maximumBudgetMinor;

        public PriceQuoteIntent(String agentOrigin, String agentName, String agentVersion,
                                String requestSha256, String currency, long maximumBudgetMinor) {
            if (!validOrigin(agentOrigin) || agentName == null || agentName.trim().isEmpty()
                || agentName.length() > 128 || containsControl(agentName) || !identifier(agentVersion)
                || requestSha256 == null || !SHA256.matcher(requestSha256).matches()
                || currency == null || !CURRENCY.matcher(currency).matches()
                || maximumBudgetMinor < 0 || maximumBudgetMinor > MAX_SAFE_INTEGER)
                throw new IllegalArgumentException("INVALID_A2A_PRICE_QUOTE_INTENT");
            this.agentOrigin = agentOrigin; this.agentName = agentName; this.agentVersion = agentVersion;
            this.requestSha256 = requestSha256; this.currency = currency; this.maximumBudgetMinor = maximumBudgetMinor;
        }
    }

    private final Map<String, TrustedKey> keys;

    /** The caller must source this immutable keyset from an operator-authenticated trust store. */
    public A2AUsageReceiptVerifier(List<TrustedKey> trustedKeys) {
        if (trustedKeys == null || trustedKeys.size() > 256)
            throw new IllegalArgumentException("INVALID_A2A_USAGE_KEYSET");
        Map<String, TrustedKey> copy = new HashMap<>();
        for (TrustedKey key : trustedKeys) {
            if (key == null || copy.putIfAbsent(identity(key.providerId, key.keyId, key.agentOrigin), key) != null)
                throw new IllegalArgumentException("DUPLICATE_A2A_USAGE_TRUST_KEY");
        }
        keys = Collections.unmodifiableMap(copy);
    }

    /** True only when at least one operator-provisioned, non-self-enrolled trust tuple exists. */
    public boolean hasTrustedKeys() {
        return keys.values().stream().anyMatch(key -> !key.revoked);
    }

    /**
     * Verifies a provider quote before the native UI shows its cost approval. Returns the SHA-256
     * digest of the exact signed terms; this digest must be retained with the later Wallet hold.
     */
    public String verifyPriceQuote(Map<String, Object> quote, PriceQuoteIntent intent, long nowMs) {
        if (quote == null || intent == null || nowMs < 0 || nowMs > MAX_SAFE_INTEGER
            || !quote.keySet().equals(PRICE_QUOTE_ALL_FIELDS))
            throw new SecurityException("INVALID_A2A_PRICE_QUOTE");
        requireEquals(quote, "schema", "rock-a2a-provider-price-quote/1");
        String provider = requiredIdentifier(quote, "providerId");
        String keyId = requiredIdentifier(quote, "keyId");
        requiredIdentifier(quote, "quoteId");
        String origin = string(quote, "agentOrigin", 512, false);
        String agentName = string(quote, "agentName", 512, true);
        String agentVersion = requiredIdentifier(quote, "agentVersion");
        String requestSha256 = string(quote, "requestSha256", 64, false);
        String pricingVersion = requiredIdentifier(quote, "pricingVersion");
        String pricingSha256 = string(quote, "pricingSha256", 64, false);
        String currency = string(quote, "currency", 3, false);
        if (!validOrigin(origin) || !safeAgentName(agentName) || !SHA256.matcher(requestSha256).matches()
            || !SHA256.matcher(pricingSha256).matches() || !CURRENCY.matcher(currency).matches())
            throw new SecurityException("INVALID_A2A_PRICE_QUOTE_TERMS");
        long estimate = safeInteger(quote.get("estimateMinor"), "INVALID_A2A_PRICE_QUOTE_ESTIMATE");
        long maximum = safeInteger(quote.get("maxAmountMinor"), "INVALID_A2A_PRICE_QUOTE_MAXIMUM");
        long issuedAt = safeInteger(quote.get("issuedAt"), "INVALID_A2A_PRICE_QUOTE_ISSUED_AT");
        long expiresAt = safeInteger(quote.get("expiresAt"), "INVALID_A2A_PRICE_QUOTE_EXPIRES_AT");
        if (estimate < 0 || maximum < estimate || maximum > intent.maximumBudgetMinor
            || issuedAt < 0 || issuedAt > nowMs + 30_000 || expiresAt <= nowMs || expiresAt <= issuedAt
            || expiresAt - issuedAt > 24L * 60 * 60 * 1000
            || !origin.equals(intent.agentOrigin) || !agentName.equals(intent.agentName)
            || !agentVersion.equals(intent.agentVersion) || !requestSha256.equals(intent.requestSha256)
            || !currency.equals(intent.currency))
            throw new SecurityException("A2A_PRICE_QUOTE_INTENT_OR_TIME_MISMATCH");
        validateQuotedUsage(quote.get("usage"), estimate);
        String signatureText = string(quote, "signature", 86, false);
        if (!SIGNATURE.matcher(signatureText).matches()) throw new SecurityException("INVALID_A2A_PRICE_QUOTE_SIGNATURE");
        byte[] signature;
        try {
            signature = Base64.getUrlDecoder().decode(signatureText);
            if (signature.length != 64 || !Base64.getUrlEncoder().withoutPadding().encodeToString(signature).equals(signatureText))
                throw new SecurityException("INVALID_A2A_PRICE_QUOTE_SIGNATURE");
        } catch (IllegalArgumentException failure) {
            throw new SecurityException("INVALID_A2A_PRICE_QUOTE_SIGNATURE", failure);
        }
        TrustedKey key = keys.get(identity(provider, keyId, origin));
        if (key == null) throw new SecurityException("A2A_USAGE_KEY_UNTRUSTED");
        if (key.revoked) throw new SecurityException("A2A_USAGE_KEY_REVOKED");
        try {
            byte[] encodedKey = new byte[ED25519_X509_PREFIX.length + key.rawPublicKey.length];
            System.arraycopy(ED25519_X509_PREFIX, 0, encodedKey, 0, ED25519_X509_PREFIX.length);
            System.arraycopy(key.rawPublicKey, 0, encodedKey, ED25519_X509_PREFIX.length, key.rawPublicKey.length);
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(encodedKey)));
            byte[] signingBytes = priceQuoteSigningBytes(quote);
            verifier.update(signingBytes);
            if (!verifier.verify(signature)) throw new SecurityException("A2A_PRICE_QUOTE_SIGNATURE_MISMATCH");
            return hex(sha256(signingBytes));
        } catch (SecurityException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SecurityException("A2A_PRICE_QUOTE_SIGNATURE_VERIFICATION_FAILED", failure);
        }
    }

    /** Exact ordered canonical bytes shared with lib/a2a-price-quote.ts. */
    public static byte[] priceQuoteSigningBytes(Map<String, Object> quote) {
        if (quote == null || !quote.keySet().equals(PRICE_QUOTE_ALL_FIELDS))
            throw new IllegalArgumentException("INVALID_A2A_PRICE_QUOTE");
        Map<String, Object> payload = new LinkedHashMap<>();
        for (String field : PRICE_QUOTE_FIELDS) {
            Object value = quote.get(field);
            if ("usage".equals(field)) {
                if (!(value instanceof List<?>)) throw new IllegalArgumentException("INVALID_A2A_PRICE_QUOTE_USAGE");
                List<Map<String, Object>> lines = new ArrayList<>();
                for (Object lineValue : (List<?>) value) {
                    if (!(lineValue instanceof Map<?, ?>)) throw new IllegalArgumentException("INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
                    Map<?, ?> line = (Map<?, ?>) lineValue;
                    if (!line.keySet().equals(Set.of("meter", "quantity", "unit", "unitPriceMinor", "amountMinor")))
                        throw new IllegalArgumentException("INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
                    Map<String, Object> ordered = new LinkedHashMap<>();
                    for (String name : Arrays.asList("meter", "quantity", "unit", "unitPriceMinor", "amountMinor"))
                        ordered.put(name, line.get(name));
                    lines.add(ordered);
                }
                payload.put(field, lines);
            } else payload.put(field, value);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(PRICE_QUOTE_DOMAIN, 0, PRICE_QUOTE_DOMAIN.length);
        writeJson(out, payload);
        return out.toByteArray();
    }

    private static void validateQuotedUsage(Object raw, long expectedTotal) {
        if (!(raw instanceof List<?>) || ((List<?>) raw).isEmpty() || ((List<?>) raw).size() > 32)
            throw new SecurityException("INVALID_A2A_PRICE_QUOTE_USAGE");
        long total = 0;
        for (Object item : (List<?>) raw) {
            if (!(item instanceof Map<?, ?>)) throw new SecurityException("INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
            Map<?, ?> line = (Map<?, ?>) item;
            if (!line.keySet().equals(Set.of("meter", "quantity", "unit", "unitPriceMinor", "amountMinor"))
                || !identifier(line.get("meter")) || !identifier(line.get("unit")))
                throw new SecurityException("INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
            long quantity = safeInteger(line.get("quantity"), "INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
            long unitPrice = safeInteger(line.get("unitPriceMinor"), "INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
            long amount = safeInteger(line.get("amountMinor"), "INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
            if (quantity < 0 || unitPrice < 0 || amount < 0 || quantity != 0 && unitPrice > MAX_SAFE_INTEGER / quantity
                || quantity * unitPrice != amount || total > MAX_SAFE_INTEGER - amount)
                throw new SecurityException("INVALID_A2A_PRICE_QUOTE_USAGE_LINE");
            total += amount;
        }
        if (total != expectedTotal) throw new SecurityException("A2A_PRICE_QUOTE_ESTIMATE_MISMATCH");
    }

    private static boolean safeAgentName(String value) {
        if (value == null || value.length() > 128) return false;
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i))) return false;
        return true;
    }

    private static boolean containsControl(String value) {
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i))) return true;
        return false;
    }

    /** Returns a digest of the verified receipt, suitable for an immutable Wallet audit entry. */
    public String verify(Map<String, Object> receipt, Hold hold, long nowMs) {
        if (receipt == null || hold == null || nowMs < 0 || !receipt.keySet().equals(RECEIPT_FIELDS))
            throw new SecurityException("INVALID_A2A_USAGE_RECEIPT");
        requireEquals(receipt, "schema", "rock-a2a-provider-usage-receipt/1");
        String provider = requiredIdentifier(receipt, "providerId");
        String keyId = requiredIdentifier(receipt, "keyId");
        requiredIdentifier(receipt, "receiptId");
        requiredIdentifier(receipt, "parentJobId");
        String owner = requiredIdentifier(receipt, "ownerUserId");
        String delegation = requiredIdentifier(receipt, "delegationId");
        String taskId = requiredIdentifier(receipt, "taskId");
        String pricingVersion = requiredIdentifier(receipt, "pricingVersion");
        String origin = string(receipt, "agentOrigin", 512, false);
        if (!validOrigin(origin)) throw new SecurityException("INVALID_A2A_AGENT_ORIGIN");
        String agentName = string(receipt, "agentName", 256, true);
        String agentVersion = string(receipt, "agentVersion", 256, true);
        String currency = string(receipt, "currency", 3, false);
        if (!CURRENCY.matcher(currency).matches()) throw new SecurityException("INVALID_A2A_CURRENCY");
        long amount = safeInteger(receipt.get("amountMinor"), "INVALID_A2A_AMOUNT");
        long issuedAt = safeInteger(receipt.get("issuedAt"), "INVALID_A2A_ISSUED_AT");
        if (amount < 0 || issuedAt < hold.createdAt || issuedAt > nowMs + 30_000 || issuedAt > hold.deadlineAt)
            throw new SecurityException("A2A_RECEIPT_TIME_OR_AMOUNT_INVALID");
        boolean stablePreDispatchTask = hold.taskId.equals(hold.delegationId);
        if (!owner.equals(hold.ownerUserId) || !requiredIdentifier(receipt, "parentJobId").equals(hold.parentJobId)
            || !delegation.equals(hold.delegationId) || (!stablePreDispatchTask && !taskId.equals(hold.taskId))
            || !origin.equals(hold.agentOrigin) || !agentName.equals(hold.agentName)
            || !agentVersion.equals(hold.agentVersion) || !pricingVersion.equals(hold.pricingVersion)
            || !currency.equals(hold.currency)
            || amount > hold.limitMinor)
            throw new SecurityException("A2A_RECEIPT_HOLD_MISMATCH");
        validateUsage(receipt.get("usage"), amount);
        String signatureText = string(receipt, "signature", 86, false);
        if (!SIGNATURE.matcher(signatureText).matches()) throw new SecurityException("INVALID_A2A_SIGNATURE");
        byte[] signature;
        try {
            signature = Base64.getUrlDecoder().decode(signatureText);
            if (signature.length != 64 || !Base64.getUrlEncoder().withoutPadding().encodeToString(signature).equals(signatureText))
                throw new SecurityException("INVALID_A2A_SIGNATURE");
        } catch (IllegalArgumentException failure) {
            throw new SecurityException("INVALID_A2A_SIGNATURE", failure);
        }
        TrustedKey key = keys.get(identity(provider, keyId, origin));
        if (key == null) throw new SecurityException("A2A_USAGE_KEY_UNTRUSTED");
        if (key.revoked) throw new SecurityException("A2A_USAGE_KEY_REVOKED");
        try {
            byte[] encodedKey = new byte[ED25519_X509_PREFIX.length + key.rawPublicKey.length];
            System.arraycopy(ED25519_X509_PREFIX, 0, encodedKey, 0, ED25519_X509_PREFIX.length);
            System.arraycopy(key.rawPublicKey, 0, encodedKey, ED25519_X509_PREFIX.length, key.rawPublicKey.length);
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(encodedKey)));
            verifier.update(signingBytes(receipt));
            if (!verifier.verify(signature)) throw new SecurityException("A2A_USAGE_SIGNATURE_MISMATCH");
            return Engine.digest("rockstaros-a2a-usage-receipt-verified/1\n" + hex(sha256(signingBytes(receipt))));
        } catch (SecurityException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SecurityException("A2A_USAGE_SIGNATURE_VERIFICATION_FAILED", failure);
        }
    }

    /** Exact ordered canonical bytes shared with the Cloudflare and Python verifiers. */
    public static byte[] signingBytes(Map<String, Object> receipt) {
        if (receipt == null || !receipt.keySet().equals(RECEIPT_FIELDS))
            throw new IllegalArgumentException("INVALID_A2A_USAGE_RECEIPT");
        Map<String, Object> payload = new LinkedHashMap<>();
        for (String field : FIELDS) {
            Object value = receipt.get(field);
            if ("usage".equals(field)) {
                if (!(value instanceof List<?>)) throw new IllegalArgumentException("INVALID_A2A_USAGE_LINES");
                List<Map<String, Object>> lines = new ArrayList<>();
                for (Object lineValue : (List<?>) value) {
                    if (!(lineValue instanceof Map<?, ?>)) throw new IllegalArgumentException("INVALID_A2A_USAGE_LINE");
                    Map<?, ?> line = (Map<?, ?>) lineValue;
                    if (!line.keySet().equals(Set.of("meter", "quantity", "unit", "amountMinor")))
                        throw new IllegalArgumentException("INVALID_A2A_USAGE_LINE");
                    Map<String, Object> ordered = new LinkedHashMap<>();
                    for (String name : Arrays.asList("meter", "quantity", "unit", "amountMinor")) ordered.put(name, line.get(name));
                    lines.add(ordered);
                }
                payload.put(field, lines);
            } else payload.put(field, value);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(DOMAIN, 0, DOMAIN.length);
        writeJson(out, payload);
        return out.toByteArray();
    }

    private static void validateUsage(Object raw, long expectedTotal) {
        if (!(raw instanceof List<?>) || ((List<?>) raw).isEmpty() || ((List<?>) raw).size() > 32)
            throw new SecurityException("INVALID_A2A_USAGE_LINES");
        long total = 0;
        for (Object item : (List<?>) raw) {
            if (!(item instanceof Map<?, ?>)) throw new SecurityException("INVALID_A2A_USAGE_LINE");
            Map<?, ?> line = (Map<?, ?>) item;
            if (!line.keySet().equals(Set.of("meter", "quantity", "unit", "amountMinor")))
                throw new SecurityException("INVALID_A2A_USAGE_LINE");
            if (!identifier(line.get("meter")) || !identifier(line.get("unit")))
                throw new SecurityException("INVALID_A2A_USAGE_LINE");
            long quantity = safeInteger(line.get("quantity"), "INVALID_A2A_USAGE_LINE");
            long amount = safeInteger(line.get("amountMinor"), "INVALID_A2A_USAGE_LINE");
            if (quantity < 0 || amount < 0 || total > MAX_SAFE_INTEGER - amount)
                throw new SecurityException("INVALID_A2A_USAGE_LINE");
            total += amount;
        }
        if (total != expectedTotal) throw new SecurityException("A2A_USAGE_TOTAL_MISMATCH");
    }

    static String canonicalJson(Object value) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeJson(out, value);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static void writeJson(ByteArrayOutputStream out, Object value) {
        if (value instanceof String) writeString(out, (String) value);
        else if (value instanceof Boolean) writeAscii(out, ((Boolean) value) ? "true" : "false");
        else if (value instanceof Number) {
            long number = safeInteger(value, "INVALID_A2A_JSON_NUMBER");
            writeAscii(out, Long.toString(number));
        } else if (value instanceof List<?>) {
            writeAscii(out, "["); boolean first = true;
            for (Object item : (List<?>) value) { if (!first) writeAscii(out, ","); first = false; writeJson(out, item); }
            writeAscii(out, "]");
        } else if (value instanceof Map<?, ?>) {
            writeAscii(out, "{"); boolean first = true;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!(entry.getKey() instanceof String)) throw new IllegalArgumentException("INVALID_A2A_JSON_KEY");
                if (!first) writeAscii(out, ","); first = false;
                writeString(out, (String) entry.getKey()); writeAscii(out, ":"); writeJson(out, entry.getValue());
            }
            writeAscii(out, "}");
        } else throw new IllegalArgumentException("INVALID_A2A_JSON_VALUE");
    }

    private static void writeString(ByteArrayOutputStream out, String value) {
        writeAscii(out, "\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') { out.write('\\'); out.write((byte) c); }
            else if (c < 0x20) {
                String escaped;
                switch (c) {
                    case '\b': escaped = "\\b"; break;
                    case '\f': escaped = "\\f"; break;
                    case '\n': escaped = "\\n"; break;
                    case '\r': escaped = "\\r"; break;
                    case '\t': escaped = "\\t"; break;
                    default: escaped = String.format(java.util.Locale.ROOT, "\\u%04x", (int) c);
                }
                writeAscii(out, escaped);
            } else if (Character.isHighSurrogate(c)) {
                if (i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(i + 1)))
                    throw new IllegalArgumentException("INVALID_A2A_UNICODE");
                byte[] pair = value.substring(i, i + 2).getBytes(StandardCharsets.UTF_8); out.write(pair, 0, pair.length); i++;
            } else if (Character.isLowSurrogate(c)) throw new IllegalArgumentException("INVALID_A2A_UNICODE");
            else { byte[] bytes = String.valueOf(c).getBytes(StandardCharsets.UTF_8); out.write(bytes, 0, bytes.length); }
        }
        writeAscii(out, "\"");
    }

    private static void writeAscii(ByteArrayOutputStream out, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.US_ASCII); out.write(bytes, 0, bytes.length);
    }
    private static void requireEquals(Map<String, Object> values, String field, String expected) {
        if (!expected.equals(values.get(field))) throw new SecurityException("INVALID_A2A_USAGE_RECEIPT");
    }
    private static String requiredIdentifier(Map<String, Object> values, String field) {
        Object value = values.get(field);
        if (!identifier(value)) throw new SecurityException("INVALID_A2A_" + field.toUpperCase(java.util.Locale.ROOT));
        return (String) value;
    }
    private static String string(Map<String, Object> values, String field, int maxUtf8Bytes, boolean nonBlank) {
        Object value = values.get(field);
        if (!(value instanceof String)) throw new SecurityException("INVALID_A2A_" + field.toUpperCase(java.util.Locale.ROOT));
        String text = (String) value;
        if (text.getBytes(StandardCharsets.UTF_8).length > maxUtf8Bytes || (nonBlank && text.trim().isEmpty()))
            throw new SecurityException("INVALID_A2A_" + field.toUpperCase(java.util.Locale.ROOT));
        return text;
    }
    private static long safeInteger(Object value, String error) {
        if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long))
            throw new SecurityException(error);
        long number = ((Number) value).longValue();
        if (number < -MAX_SAFE_INTEGER || number > MAX_SAFE_INTEGER) throw new SecurityException(error);
        return number;
    }
    private static boolean identifier(Object value) {
        return value instanceof String && IDENTIFIER.matcher((String) value).matches();
    }
    private static boolean validOrigin(String origin) {
        if (origin == null || origin.length() > 512 || !origin.startsWith("https://") || origin.contains("@") ||
            origin.indexOf('/', 8) >= 0 || origin.indexOf('?') >= 0 || origin.indexOf('#') >= 0 || origin.indexOf(':', 8) >= 0) return false;
        String host = origin.substring(8);
        return host.equals(host.toLowerCase(java.util.Locale.ROOT)) && DOMAIN_HOST.matcher(host).matches()
            && !host.endsWith(".localhost") && !host.endsWith(".local")
            && !host.endsWith(".internal") && !host.endsWith(".test") && !host.endsWith(".invalid");
    }
    private static String identity(String provider, String keyId, String origin) { return provider + "\n" + keyId + "\n" + origin; }
    private static byte[] sha256(byte[] bytes) throws Exception { return java.security.MessageDigest.getInstance("SHA-256").digest(bytes); }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }
}
