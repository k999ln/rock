package dev.rock.shell;

/** Freshness of a local observation on the same elapsed-realtime clock. */
final class CapabilitySnapshotFreshness {
    private CapabilitySnapshotFreshness() {}

    static boolean isFresh(long now, long observedAt, long expiresAt) {
        // Order checks before subtraction: accepted timestamps are nonnegative and ordered,
        // so the lifetime cannot wrap even at the end of the signed-long range.
        return now >= 0 && observedAt >= 0 && observedAt <= now
            && expiresAt > now && expiresAt > observedAt
            && expiresAt - observedAt <= 30_000L;
    }
}
