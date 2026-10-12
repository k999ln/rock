package dev.rock.core.platform;

import java.io.IOException;
import java.util.Map;

/**
 * Reconciles an already-settled cloud A2A task into the device Wallet after reconnect.
 * The transport must authenticate the owner and fetch the no-store, device-key-authorized handoff;
 * this class never retries task execution or releases a reservation on transport failure.
 */
public final class A2AWalletSettlementSync {
    @FunctionalInterface
    public interface AuthenticatedHandoffSource {
        /** Fetch the owner-scoped signed device handoff. Implementations must not return cached responses. */
        Map<String,Object> fetch(String owner, String delegationId) throws IOException;
    }

    private final PlatformStore store;
    private final AuthenticatedHandoffSource source;

    public A2AWalletSettlementSync(PlatformStore store, AuthenticatedHandoffSource source) {
        if (store == null || source == null) throw new IllegalArgumentException("INVALID_A2A_HANDOFF_SYNC");
        this.store = store;
        this.source = source;
    }

    /** GET is safe to repeat; the local Core validates and settles the signed receipt idempotently. */
    public String synchronize(String owner, String delegationId, long now) throws IOException {
        Map<String,Object> handoff = source.fetch(owner, delegationId);
        if (handoff == null) throw new IOException("EMPTY_A2A_WALLET_HANDOFF");
        return store.applyA2AWalletSettlementHandoff(owner, delegationId, handoff, now);
    }
}
