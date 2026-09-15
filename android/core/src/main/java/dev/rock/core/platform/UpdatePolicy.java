package dev.rock.core.platform;

/** Signature, API and data-compatibility gate used before activation or rollback. */
public final class UpdatePolicy {
    private UpdatePolicy() {}

    public static void requireUpdate(ComponentManifest current, ComponentManifest next, int storedDataSchema) {
        requireSameIdentity(current, next);
        if (next.versionCode <= current.versionCode) throw new IllegalArgumentException("UPDATE_NOT_NEWER");
        if (!current.signingDigest.equals(next.signingDigest)) throw new SecurityException("SIGNER_CHANGED");
        if (!next.readsDataSchema(storedDataSchema)) throw new IllegalStateException("UPDATE_DATA_INCOMPATIBLE");
    }

    public static void requireRollback(ComponentManifest current, ComponentManifest cached, int storedDataSchema) {
        requireSameIdentity(current, cached);
        if (cached.versionCode >= current.versionCode) throw new IllegalArgumentException("ROLLBACK_NOT_OLDER");
        if (!current.signingDigest.equals(cached.signingDigest)) throw new SecurityException("ROLLBACK_SIGNER_CHANGED");
        if (!cached.readsDataSchema(storedDataSchema)) throw new IllegalStateException("ROLLBACK_DATA_INCOMPATIBLE");
    }

    private static void requireSameIdentity(ComponentManifest a, ComponentManifest b) {
        if (a.kind != b.kind || !a.componentId.equals(b.componentId) ||
            !a.packageName.equals(b.packageName) || a.uid != b.uid ||
            !a.securityDomain.equals(b.securityDomain)) {
            throw new SecurityException("COMPONENT_IDENTITY_CHANGED");
        }
    }
}
