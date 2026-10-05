package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;

/** Immutable, hash-addressed model/runtime compatibility contract. Does not claim artifact verification. */
public final class ModelProfileManifest {
    public final String profileId, licenseId, publisherId, signingKeyId, manifestSignatureBase64Url;
    public final String runtimeComponentId, format, quantization, planSchemaId;
    public final long version, runtimeVersionCode, artifactBytes, minRamBytes;
    public final String weightsSha256, tokenizerSha256, templateSha256;
    public final int runtimeApiMin, runtimeApiMax, contextTokens;

    public ModelProfileManifest(String profileId, long version, String weightsSha256,
        String tokenizerSha256, String templateSha256, String licenseId,
        String publisherId, String signingKeyId, String manifestSignatureBase64Url,
        String runtimeComponentId, long runtimeVersionCode, int runtimeApiMin, int runtimeApiMax,
        String format, String quantization, int contextTokens, String planSchemaId,
        long artifactBytes, long minRamBytes) {
        require(profileId, "[a-z0-9]+(?:[._-][a-z0-9]+){2,}", "INVALID_PROFILE_ID");
        if (version < 1 || runtimeVersionCode < 1) throw new IllegalArgumentException("INVALID_PROFILE_VERSION");
        digest(weightsSha256, "INVALID_WEIGHTS_HASH");
        digest(tokenizerSha256, "INVALID_TOKENIZER_HASH");
        digest(templateSha256, "INVALID_TEMPLATE_HASH");
        require(licenseId, "[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}", "INVALID_LICENSE_ID");
        require(publisherId, "[A-Za-z0-9][A-Za-z0-9._:-]{2,127}", "INVALID_PUBLISHER_ID");
        require(signingKeyId, "[A-Za-z0-9][A-Za-z0-9._:-]{2,127}", "INVALID_MODEL_SIGNING_KEY_ID");
        require(manifestSignatureBase64Url, "[A-Za-z0-9_-]{86}", "INVALID_MODEL_MANIFEST_SIGNATURE");
        require(runtimeComponentId, "[a-z0-9]+(?:[._-][a-z0-9]+){2,}", "INVALID_RUNTIME_ID");
        PlatformApi.requireCompatible(runtimeApiMin, runtimeApiMax);
        require(format, "[A-Z][A-Z0-9_]{0,31}", "INVALID_MODEL_FORMAT");
        require(quantization, "[A-Z0-9][A-Z0-9_]{0,31}", "INVALID_QUANTIZATION");
        if (contextTokens < 1 || contextTokens > 1_048_576) throw new IllegalArgumentException("INVALID_CONTEXT_LIMIT");
        require(planSchemaId, PlatformApi.PLAN_SCHEMA_ID_PATTERN, "INVALID_PLAN_SCHEMA");
        if (artifactBytes < 1 || minRamBytes < 1) throw new IllegalArgumentException("INVALID_RESOURCE_REQUIREMENT");
        this.profileId = profileId; this.version = version;
        this.weightsSha256 = weightsSha256; this.tokenizerSha256 = tokenizerSha256;
        this.templateSha256 = templateSha256; this.licenseId = licenseId;
        this.publisherId = publisherId; this.signingKeyId = signingKeyId;
        this.manifestSignatureBase64Url = manifestSignatureBase64Url;
        this.runtimeComponentId = runtimeComponentId; this.runtimeVersionCode = runtimeVersionCode;
        this.runtimeApiMin = runtimeApiMin; this.runtimeApiMax = runtimeApiMax;
        this.format = format; this.quantization = quantization; this.contextTokens = contextTokens;
        this.planSchemaId = planSchemaId; this.artifactBytes = artifactBytes; this.minRamBytes = minRamBytes;
    }

    /** Canonical signed bytes, excluding the detached Ed25519 signature itself. */
    public String signedPayload() {
        return String.join("\n", "rockstaros-model-profile/1", profileId, Long.toString(version), weightsSha256,
            tokenizerSha256, templateSha256, licenseId, runtimeComponentId, Long.toString(runtimeVersionCode),
            publisherId, signingKeyId, runtimeApiMin + ":" + runtimeApiMax, format, quantization,
            Integer.toString(contextTokens), planSchemaId, Long.toString(artifactBytes), Long.toString(minRamBytes));
    }

    /** Includes signature bytes for immutable registry comparison. */
    public String digest() {
        return Engine.digest(signedPayload() + "\n" + manifestSignatureBase64Url);
    }

    public boolean accepts(RuntimeManifest runtime) {
        return runtime != null && runtime.componentId.equals(runtimeComponentId)
            && runtime.versionCode == runtimeVersionCode
            && runtime.apiMin <= runtimeApiMax && runtime.apiMax >= runtimeApiMin
            && runtime.modelFormats.contains(format) && runtime.planSchemas.contains(planSchemaId);
    }

    private static void digest(String value, String error) { require(value, "[a-f0-9]{64}", error); }
    private static void require(String value, String pattern, String error) {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 256 || !value.matches(pattern))
            throw new IllegalArgumentException(error);
    }
}
