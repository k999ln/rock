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

    /** Recover the response of a committed Wallet reservation without consuming approval again. */
    public static boolean isConfirmedHeldReservation(Map<String,String> local, String owner,
            String delegationId, String approvalId, String payloadDigest, long limitMinor) {
        if (local == null || owner == null || delegationId == null || approvalId == null ||
                !owner.equals(local.get("owner")) || !delegationId.equals(local.get("delegation_id")) ||
                !"HELD".equals(local.get("state")) || !approvalId.equals(local.get("approval_id")) ||
                !sameDigest(payloadDigest, local.get("approval_digest"))) return false;
        try { return limitMinor > 0 && Long.parseLong(local.get("held_minor")) == limitMinor; }
        catch (RuntimeException malformed) { return false; }
    }

    /**
     * Compares normalized Cloud fields with an owner-scoped durable local reservation.
     * The caller must fetch Cloud data using the authenticated owner session and must not
     * mutate the reservation when this returns false.
     */
    public static boolean matches(Map<String,String> cloud, Map<String,String> local) {
        return sameTerms(cloud, local) && local.get("state") != null &&
            RECOVERABLE_WALLET_STATES.contains(local.get("state"));
    }

    /** Terminal identity only; PlatformStore must also verify the saved settlement receipt and ledger. */
    static boolean matchesSettledTerms(Map<String,String> cloud, Map<String,String> local) {
        return local != null && "SETTLED".equals(local.get("state")) && sameTerms(cloud, local);
    }

    private static boolean sameTerms(Map<String,String> cloud, Map<String,String> local) {
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
                !sameDigest(cloud.get("walletApprovalDigest"), local.get("approval_digest"))) return false;
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
