package dev.rock.automation;

import dev.rock.core.platform.A2AUsageReceiptVerifier;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Parses the operator-provisioned public Provider receipt keys packaged with this build. */
final class AndroidA2AUsageTrustConfig {
    private static final int MAX_BYTES = 64 * 1024;
    private static final Set<String> KEY_FIELDS = Set.of(
        "providerId", "keyId", "agentOrigin", "publicKeyBase64", "revoked");

    private AndroidA2AUsageTrustConfig() {}

    static A2AUsageReceiptVerifier verifier(String json) {
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES)
            throw new IllegalArgumentException("INVALID_A2A_PROVIDER_USAGE_KEYSET");
        try {
            JSONArray rows = new JSONArray(json);
            if (rows.length() > 256) throw new IllegalArgumentException("INVALID_A2A_PROVIDER_USAGE_KEYSET");
            List<A2AUsageReceiptVerifier.TrustedKey> keys = new ArrayList<>();
            for (int i = 0; i < rows.length(); i++) {
                Object value = rows.get(i);
                if (!(value instanceof JSONObject)) throw new IllegalArgumentException("INVALID_A2A_PROVIDER_USAGE_KEY");
                JSONObject row = (JSONObject) value;
                Set<String> fields = new HashSet<>();
                row.keys().forEachRemaining(fields::add);
                if (!KEY_FIELDS.equals(fields)) throw new IllegalArgumentException("INVALID_A2A_PROVIDER_USAGE_KEY_FIELDS");
                Object provider = row.get("providerId");
                Object keyId = row.get("keyId");
                Object origin = row.get("agentOrigin");
                Object encodedKey = row.get("publicKeyBase64");
                Object revoked = row.get("revoked");
                if (!(provider instanceof String) || !(keyId instanceof String) ||
                    !(origin instanceof String) || !(encodedKey instanceof String) || !(revoked instanceof Boolean))
                    throw new IllegalArgumentException("INVALID_A2A_PROVIDER_USAGE_KEY_TYPES");
                byte[] publicKey = java.util.Base64.getDecoder().decode((String) encodedKey);
                if (!java.util.Base64.getEncoder().encodeToString(publicKey).equals(encodedKey))
                    throw new IllegalArgumentException("NON_CANONICAL_A2A_PROVIDER_USAGE_KEY");
                keys.add(new A2AUsageReceiptVerifier.TrustedKey((String) provider, (String) keyId,
                    (String) origin, publicKey, (Boolean) revoked));
                Arrays.fill(publicKey, (byte) 0);
            }
            return new A2AUsageReceiptVerifier(keys);
        } catch (IllegalArgumentException invalid) {
            throw invalid;
        } catch (Exception invalid) {
            throw new IllegalArgumentException("INVALID_A2A_PROVIDER_USAGE_KEYSET", invalid);
        }
    }
}
