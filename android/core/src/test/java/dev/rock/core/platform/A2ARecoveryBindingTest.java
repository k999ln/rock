package dev.rock.core.platform;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public final class A2ARecoveryBindingTest {
    private static final String DIGEST = "a".repeat(64);

    private Map<String,String> cloud() {
        Map<String,String> value = new HashMap<>();
        value.put("owner", "alice");
        value.put("delegationId", "delegation-1");
        value.put("parentJobId", "parent-1");
        value.put("agentOrigin", "https://agent.example.com");
        value.put("agentName", "Research Agent");
        value.put("agentVersion", "1.2.0");
        value.put("currency", "USD");
        value.put("pricingVersion", "price-v3");
        value.put("walletApprovalDigest", DIGEST);
        value.put("budgetLimitMinor", "900");
        value.put("deadlineAt", "1900000000000");
        value.put("quoteIssuedAt", "1800000000000");
        return value;
    }

    private Map<String,String> local() {
        Map<String,String> value = new HashMap<>();
        value.put("owner", "alice");
        value.put("delegation_id", "delegation-1");
        value.put("task_id", "delegation-1");
        value.put("parent_job_id", "parent-1");
        value.put("agent_origin", "https://agent.example.com");
        value.put("agent_name", "Research Agent");
        value.put("agent_version", "1.2.0");
        value.put("currency", "USD");
        value.put("pricing_version", "price-v3");
        value.put("approval_digest", DIGEST);
        value.put("budget_limit_minor", "900");
        value.put("deadline_at", "1900000000000");
        value.put("created_at", "1800000000000");
        value.put("state", "HELD");
        return value;
    }

    @Test public void exactOwnerTaskQuoteAndHeldReservationCanRecover() {
        assertTrue(A2ARecoveryBinding.matches(cloud(), local()));
    }

    @Test public void missingLocalReservationCannotRecover() {
        assertFalse(A2ARecoveryBinding.matches(cloud(), null));
    }

    @Test public void foreignOwnerCannotRecoverAnotherOwnersReservation() {
        Map<String,String> remote = cloud(); remote.put("owner", "bob");
        assertFalse(A2ARecoveryBinding.matches(remote, local()));
    }

    @Test public void changedParentAgentOrWalletApprovalDigestCannotRecover() {
        for (String key : new String[] { "parentJobId", "agentOrigin", "agentName", "agentVersion", "walletApprovalDigest" }) {
            Map<String,String> remote = cloud(); remote.put(key, "changed");
            assertFalse("cloud " + key, A2ARecoveryBinding.matches(remote, local()));
        }
    }

    @Test public void changedPriceCurrencyCapDeadlineOrQuoteTimeCannotRecover() {
        for (String key : new String[] { "pricingVersion", "currency", "budgetLimitMinor", "deadlineAt", "quoteIssuedAt" }) {
            Map<String,String> remote = cloud(); remote.put(key, "changed");
            assertFalse("cloud " + key, A2ARecoveryBinding.matches(remote, local()));
        }
    }

    @Test public void onlyActiveWalletReservationStatesCanRecover() {
        for (String state : new String[] { "SETTLED", "RELEASED", "unknown" }) {
            Map<String,String> reservation = local(); reservation.put("state", state);
            assertFalse("wallet " + state, A2ARecoveryBinding.matches(cloud(), reservation));
        }
        for (String state : new String[] { "HELD", "DISPATCHED", "INDETERMINATE", "RECOVERY_REQUIRED" }) {
            Map<String,String> reservation = local(); reservation.put("state", state);
            assertTrue("wallet " + state, A2ARecoveryBinding.matches(cloud(), reservation));
        }
    }

    @Test public void malformedRowsAndDigestsFailClosed() {
        Map<String,String> reservation = local(); reservation.put("deadline_at", "NaN");
        assertFalse(A2ARecoveryBinding.matches(cloud(), reservation));
        reservation = local(); reservation.put("approval_digest", "not-a-digest");
        assertFalse(A2ARecoveryBinding.matches(cloud(), reservation));
    }
}
