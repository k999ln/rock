package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Broker-readable declaration of the local inference runtime's accepted model contract. */
public final class RuntimeManifest {
    public final String componentId;
    public final long versionCode;
    public final String signingDigest;
    public final int apiMin, apiMax;
    public final List<String> modelFormats, planSchemas;

    public RuntimeManifest(String componentId, long versionCode, String signingDigest,
        int apiMin, int apiMax, List<String> modelFormats, List<String> planSchemas) {
        require(componentId, "[a-z0-9]+(?:[._-][a-z0-9]+){2,}", "INVALID_RUNTIME_ID");
        if (versionCode < 1) throw new IllegalArgumentException("INVALID_RUNTIME_VERSION");
        require(signingDigest, "[a-f0-9]{64}", "INVALID_RUNTIME_SIGNER");
        PlatformApi.requireCompatible(apiMin, apiMax);
        this.componentId = componentId;
        this.versionCode = versionCode;
        this.signingDigest = signingDigest;
        this.apiMin = apiMin;
        this.apiMax = apiMax;
        this.modelFormats = values(modelFormats, "INVALID_MODEL_FORMAT", "[A-Z][A-Z0-9_]{0,31}");
        this.planSchemas = values(planSchemas, "INVALID_PLAN_SCHEMA", PlatformApi.PLAN_SCHEMA_ID_PATTERN);
    }

    public String digest() {
        return Engine.digest(String.join("\n", componentId, Long.toString(versionCode), signingDigest,
            apiMin + ":" + apiMax, String.join(",", modelFormats), String.join(",", planSchemas)));
    }

    private static List<String> values(List<String> values, String error, String pattern) {
        if (values == null || values.isEmpty() || values.size() > 16) throw new IllegalArgumentException(error);
        ArrayList<String> copy = new ArrayList<>();
        for (String value : values) {
            require(value, pattern, error);
            if (copy.contains(value)) throw new IllegalArgumentException(error);
            copy.add(value);
        }
        Collections.sort(copy);
        return Collections.unmodifiableList(copy);
    }

    private static void require(String value, String pattern, String error) {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 256 || !value.matches(pattern))
            throw new IllegalArgumentException(error);
    }
}
