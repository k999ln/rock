package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Bounded identity and capability declaration. Signing is verified before constructing this value. */
public final class ComponentManifest {
    public enum Kind { TOOL, MCP, PROVIDER }

    private static final Set<String> TOOL_PERMISSIONS = Set.of(
        "text.input", "text.output", "local-ai.inference", "artifact.read", "artifact.write"
    );
    private static final Set<String> MCP_PERMISSIONS = Set.of(
        "mcp.connect", "mcp.list", "mcp.invoke", "network.mcp", "artifact.read", "artifact.write"
    );
    private static final Set<String> PROVIDER_PERMISSIONS = Set.of(
        "provider.connect", "provider.status", "wallet.proposal", "wallet.receipt", "network.provider"
    );

    public final Kind kind;
    public final String componentId;
    public final String packageName;
    public final long versionCode;
    public final int apiMin;
    public final int apiMax;
    public final int uid;
    public final String securityDomain;
    public final String signingDigest;
    public final List<String> permissions;
    public final int dataSchemaMin;
    public final int dataSchemaMax;

    public ComponentManifest(
        Kind kind, String componentId, String packageName, long versionCode,
        int apiMin, int apiMax, int uid, String securityDomain, String signingDigest,
        List<String> permissions, int dataSchemaMin, int dataSchemaMax
    ) {
        if (kind == null) throw new IllegalArgumentException("KIND_REQUIRED");
        require(componentId, "[a-z0-9]+(?:[._-][a-z0-9]+){2,}", "INVALID_COMPONENT_ID");
        require(packageName, "[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*){2,}", "INVALID_PACKAGE");
        if (versionCode < 1) throw new IllegalArgumentException("INVALID_VERSION");
        PlatformApi.requireCompatible(apiMin, apiMax);
        if (uid < 10_000 || uid > 99_999) throw new IllegalArgumentException("INVALID_APP_UID");
        String expectedDomain = expectedDomain(kind);
        if (!expectedDomain.equals(securityDomain)) throw new SecurityException("INVALID_SELINUX_DOMAIN");
        require(signingDigest, "[a-f0-9]{64}", "INVALID_SIGNING_DIGEST");
        if (dataSchemaMin < 1 || dataSchemaMax < dataSchemaMin) {
            throw new IllegalArgumentException("INVALID_DATA_SCHEMA_RANGE");
        }
        Set<String> allowed = allowedPermissions(kind);
        if (permissions == null || permissions.isEmpty() || permissions.size() > 16) {
            throw new IllegalArgumentException("PERMISSIONS_REQUIRED");
        }
        ArrayList<String> normalized = new ArrayList<>();
        HashSet<String> seen = new HashSet<>();
        for (String permission : permissions) {
            if (permission == null || !allowed.contains(permission) || !seen.add(permission)) {
                throw new SecurityException("INVALID_COMPONENT_PERMISSION");
            }
            normalized.add(permission);
        }
        Collections.sort(normalized);
        this.kind = kind;
        this.componentId = componentId;
        this.packageName = packageName;
        this.versionCode = versionCode;
        this.apiMin = apiMin;
        this.apiMax = apiMax;
        this.uid = uid;
        this.securityDomain = securityDomain;
        this.signingDigest = signingDigest;
        this.permissions = Collections.unmodifiableList(normalized);
        this.dataSchemaMin = dataSchemaMin;
        this.dataSchemaMax = dataSchemaMax;
    }

    public String digest() {
        String canonical = String.join("\n",
            kind.name(), componentId, packageName, Long.toString(versionCode),
            apiMin + ":" + apiMax, Integer.toString(uid), securityDomain, signingDigest,
            String.join(",", permissions), dataSchemaMin + ":" + dataSchemaMax
        );
        return Engine.digest(canonical);
    }

    public boolean readsDataSchema(int version) {
        return version >= dataSchemaMin && version <= dataSchemaMax;
    }

    public static String expectedDomain(Kind kind) {
        return "rock_" + kind.name().toLowerCase(Locale.ROOT) + "_app";
    }

    private static Set<String> allowedPermissions(Kind kind) {
        if (kind == Kind.TOOL) return TOOL_PERMISSIONS;
        if (kind == Kind.MCP) return MCP_PERMISSIONS;
        return PROVIDER_PERMISSIONS;
    }

    private static void require(String value, String pattern, String error) {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 256 || !value.matches(pattern)) {
            throw new IllegalArgumentException(error);
        }
    }
}
