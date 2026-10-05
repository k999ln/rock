package dev.rock.core.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Set;

/** Exact Cloud-to-device Wallet binding required before a lost client can reconcile a delegation. */
public final class A2ARecoveryBinding {
    private static final Set<String> RECOVERABLE_WALLET_STATES = Set.of(
        "HELD", "DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED");

    private A2ARecoveryBinding() { }

    /**
     * Compares normalized Cloud fields with an owner-scoped durable local reservation.
     * The caller must fetch Cloud data using the authenticated owner session and must not
     * mutate the reservation when this returns false.
     */
    public static boolean matches(Map<String,String> cloud, Map<String,String> local) {
        if (cloud == null || local == null) return false;
        if (!same(cloud, "owner", local, "owner") ||
                !same(cloud, "delegationId", local, "delegation_id") ||
                !same(cloud, "delegationId", local, "task_id") ||
                !same(cloud, "parentJobId", local, "parent_job_id") ||
                !same(cloud, "agentOrigin", local, "agent_origin") ||
                !same(cloud, "agentName", local, "agent_name") ||
                !same(cloud, "agentVersion", local, "agent_version") ||
                !same(cloud, "currency", local, "currency") ||
                !same(cloud, "pricingVersion", local, "pricing_version") ||
                !sameDigest(cloud.get("walletApprovalDigest"), local.get("approval_digest")) ||
                !RECOVERABLE_WALLET_STATES.contains(local.get("state"))) return false;
        try {
            return Long.parseLong(cloud.get("budgetLimitMinor")) == Long.parseLong(local.get("budget_limit_minor")) &&
                Long.parseLong(cloud.get("deadlineAt")) == Long.parseLong(local.get("deadline_at")) &&
                Long.parseLong(cloud.get("quoteIssuedAt")) == Long.parseLong(local.get("created_at"));
        } catch (RuntimeException malformed) {
            return false;
        }
    }

    private static boolean same(Map<String,String> left, String leftKey,
            Map<String,String> right, String rightKey) {
        String a = left.get(leftKey), b = right.get(rightKey);
        return a != null && !a.isEmpty() && a.equals(b);
    }

    private static boolean sameDigest(String left, String right) {
        if (!isSha256(left) || !isSha256(right)) return false;
        return MessageDigest.isEqual(left.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII),
            right.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII));
    }

    private static boolean isSha256(String value) {
        if (value == null || value.length() != 64) return false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
        }
        return true;
    }
}
