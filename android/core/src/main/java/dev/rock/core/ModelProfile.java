package dev.rock.core;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Immutable ModelProfile record (docs/ai-native-os-architecture.md section 2): model ID/version,
 * weight/tokenizer/chat-template hashes, license, runtime API range, quantization/format,
 * context limit, plan schema, RAM/storage requirement and measurement/quality notes.
 * A profile ID is immutable: the same ID with different content is a conflict, never an update.
 */
public final class ModelProfile {
    private static final Pattern MODEL_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");
    private static final Pattern VERSION = Pattern.compile("[0-9]{1,6}(\\.[0-9]{1,6}){0,2}");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._+-]{0,63}");
    private static final Pattern PLAN_SCHEMA = Pattern.compile("[a-z0-9-]{1,64}@[0-9]{1,6}/[a-z0-9-]{1,64}");
    public static final int MIN_CONTEXT_TOKENS = 256;
    public static final int MAX_CONTEXT_TOKENS = 1_048_576;

    public final String modelId, version, weightsSha256, tokenizerSha256, chatTemplateSha256;
    public final String license, quantization, format, planSchema, measuredOn, qualityResult;
    public final int runtimeApiMin, runtimeApiMax, contextTokens;
    public final long requiredRamBytes, requiredStorageBytes;

    public ModelProfile(String modelId, String version, String weightsSha256, String tokenizerSha256,
                        String chatTemplateSha256, String license, int runtimeApiMin, int runtimeApiMax,
                        String quantization, String format, int contextTokens, String planSchema,
                        long requiredRamBytes, long requiredStorageBytes, String measuredOn, String qualityResult) {
        this.modelId = require(modelId, MODEL_ID, "INVALID_MODEL_ID");
        this.version = require(version, VERSION, "INVALID_MODEL_VERSION");
        this.weightsSha256 = require(weightsSha256, SHA256, "INVALID_WEIGHTS_HASH");
        this.tokenizerSha256 = require(tokenizerSha256, SHA256, "INVALID_TOKENIZER_HASH");
        this.chatTemplateSha256 = require(chatTemplateSha256, SHA256, "INVALID_CHAT_TEMPLATE_HASH");
        this.license = require(license, TOKEN, "LICENSE_REQUIRED");
        this.quantization = require(quantization, TOKEN, "INVALID_QUANTIZATION");
        this.format = require(format, TOKEN, "INVALID_MODEL_FORMAT");
        this.planSchema = require(planSchema, PLAN_SCHEMA, "INVALID_PLAN_SCHEMA");
        if (runtimeApiMin < 1 || runtimeApiMax < runtimeApiMin) throw new IllegalArgumentException("INVALID_RUNTIME_API_RANGE");
        if (contextTokens < MIN_CONTEXT_TOKENS || contextTokens > MAX_CONTEXT_TOKENS)
            throw new IllegalArgumentException("INVALID_CONTEXT_LIMIT");
        if (requiredRamBytes <= 0 || requiredStorageBytes <= 0) throw new IllegalArgumentException("INVALID_RESOURCE_REQUIREMENT");
        this.runtimeApiMin = runtimeApiMin; this.runtimeApiMax = runtimeApiMax; this.contextTokens = contextTokens;
        this.requiredRamBytes = requiredRamBytes; this.requiredStorageBytes = requiredStorageBytes;
        this.measuredOn = note(measuredOn, "MEASUREMENT_NOTE_REQUIRED");
        this.qualityResult = note(qualityResult, "QUALITY_NOTE_REQUIRED");
    }

    /** Pin key stored with each work. */
    public String id() { return modelId + "@" + version; }

    /** Content digest over every field; a stored row must still hash to its recorded digest. */
    public String digest() {
        return Engine.digest(String.join("\n", "model-profile@1", modelId, version, weightsSha256, tokenizerSha256,
            chatTemplateSha256, license, Integer.toString(runtimeApiMin), Integer.toString(runtimeApiMax), quantization,
            format, Integer.toString(contextTokens), planSchema, Long.toString(requiredRamBytes),
            Long.toString(requiredStorageBytes), measuredOn, qualityResult));
    }

    /** True when the single installed runtime adapter can run this profile without changing the plan contract. */
    public boolean compatibleWith(int runtimeApi, java.util.Set<String> runtimeFormats, String runtimePlanSchema) {
        return runtimeApiMin <= runtimeApi && runtimeApi <= runtimeApiMax
            && runtimeFormats.contains(format) && planSchema.equals(runtimePlanSchema);
    }

    static ModelProfile fromRow(Map<String,String> r) {
        return new ModelProfile(r.get("model_id"), r.get("version"), r.get("weights_sha256"), r.get("tokenizer_sha256"),
            r.get("chat_template_sha256"), r.get("license"), Integer.parseInt(r.get("runtime_api_min")),
            Integer.parseInt(r.get("runtime_api_max")), r.get("quantization"), r.get("format"),
            Integer.parseInt(r.get("context_tokens")), r.get("plan_schema"), Long.parseLong(r.get("required_ram_bytes")),
            Long.parseLong(r.get("required_storage_bytes")), r.get("measured_on"), r.get("quality_result"));
    }

    private static String require(String value, Pattern pattern, String error) {
        if (value == null || !pattern.matcher(value).matches()) throw new IllegalArgumentException(error);
        return value;
    }

    private static String note(String value, String error) {
        if (value == null || value.trim().isEmpty() || value.length() > 200 || value.contains("\n"))
            throw new IllegalArgumentException(error);
        return value.trim();
    }

    @Override public String toString() { return String.format(Locale.ROOT, "ModelProfile[%s]", id()); }
}
