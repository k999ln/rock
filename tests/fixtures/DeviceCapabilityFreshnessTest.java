package dev.rock.shell;

/** Runs the time guard extracted from the actual Shell consumer, without Android doubles. */
public final class DeviceCapabilityFreshnessTest {
    private static int passed;

    private static void check(String name, long now, long observed, long expires, boolean expected) {
        boolean actual = ConsumerFreshnessProbe.isFresh(now, observed, expires);
        if (actual != expected) {
            throw new AssertionError(name + ": expected " + expected + ", got " + actual);
        }
        passed++;
    }

    public static void main(String[] args) {
        check("future-observation", 1000, 2000, 32000, false);
        check("observed-now", 1000, 1000, 31000, true);
        check("fresh-past", 1000, 999, 30999, true);
        check("zero-clock", 0, 0, 30000, true);
        check("one-ms-lifetime", 0, 0, 1, true);
        check("last-ms-before-expiry", 29999, 0, 30000, true);
        check("expiry-now", 30000, 0, 30000, false);
        check("expired", 30001, 0, 30000, false);
        check("negative-observation-unknown", 1000, -1, 31000, false);
        check("negative-expiry-unknown", 1000, 0, -1, false);
        check("negative-now", -1, 0, 30000, false);
        check("minimum-observation", 0, Long.MIN_VALUE, 30000, false);
        check("minimum-now", Long.MIN_VALUE, 0, 30000, false);
        check("minimum-expiry", 0, 0, Long.MIN_VALUE, false);
        check("zero-lifetime", 1000, 1000, 1000, false);
        check("reversed-lifetime", 1000, 1000, 999, false);
        check("ttl-over-limit", 0, 0, 30001, false);
        check("huge-lifetime", 1, 0, Long.MAX_VALUE, false);
        check("max-clock-expired", Long.MAX_VALUE, Long.MAX_VALUE - 1, Long.MAX_VALUE, false);
        check("max-expiry-valid", Long.MAX_VALUE - 1, Long.MAX_VALUE - 30000, Long.MAX_VALUE, true);
        check("max-expiry-over-ttl", Long.MAX_VALUE - 1, Long.MAX_VALUE - 30001, Long.MAX_VALUE, false);
        check("wrapped-expiry", Long.MAX_VALUE - 1, Long.MAX_VALUE - 10, Long.MIN_VALUE, false);
        check("subtract-wrap-negative-observation", 0, Long.MIN_VALUE, Long.MAX_VALUE, false);
        System.out.println("PASS " + passed + " freshness boundaries (actual consumer time guard)");
    }
}
