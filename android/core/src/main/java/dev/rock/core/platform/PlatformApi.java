package dev.rock.core.platform;

/** Stable compatibility boundary shared by Tool, MCP and financial Provider clients. */
public final class PlatformApi {
    public static final int VERSION = 1;
    public static final int MIN_SUPPORTED = 1;
    public static final int MAX_SUPPORTED = 1;
    public static final String BACKUP_FORMAT = "rockstar-platform-backup/1";
    public static final String RECOVERABLE_BACKUP_FORMAT = "avocadoos-recoverable-backup/2";

    private PlatformApi() {}

    public static void requireCompatible(int clientMin, int clientMax) {
        if (clientMin < 1 || clientMax < clientMin || clientMin > MAX_SUPPORTED || clientMax < MIN_SUPPORTED) {
            throw new IllegalArgumentException("INCOMPATIBLE_PLATFORM_API");
        }
    }
}
