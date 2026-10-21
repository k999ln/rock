package dev.rock.automation;

import dev.rock.core.Engine;
import dev.rock.core.platform.ModelProfileManifest;
import dev.rock.core.platform.TrustedModelPublisherVerifier;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bundled publisher-signed definitions plus separately authenticated owner-admitted definitions. */
final class LocalModelCatalog {
    static final String ASSET = "rock-local-model-catalog.json";
    static final class Entry {
        final String name, fileName, source, licenseUrl, trustLabel;
        final ModelProfileManifest profile;
        final java.util.Set<String> tasks; final int autoPriority;
        Entry(JSONObject value) throws Exception {
            exact(value, "name", "fileName", "source", "licenseUrl", "trustLabel", "profile", "tasks", "autoPriority");
            java.util.Set<String> capabilities = new java.util.LinkedHashSet<>();
            JSONArray taskValues = value.getJSONArray("tasks");
            for (int i = 0; i < taskValues.length(); i++) {
                String task = taskValues.getString(i);
                if (!dev.rock.sdk.LocalWorkDraft.TASKS.contains(task) || !capabilities.add(task)) throw new SecurityException("INVALID_MODEL_CAPABILITIES");
            }
            tasks = java.util.Collections.unmodifiableSet(capabilities); autoPriority = value.getInt("autoPriority");
            if (tasks.isEmpty() || autoPriority < 0 || autoPriority > 100) throw new SecurityException("INVALID_MODEL_CAPABILITIES");
            name = bounded(value.getString("name"), 120);
            fileName = bounded(value.getString("fileName"), 120);
            if (!fileName.matches("[A-Za-z0-9._-]+\\.gguf")) throw new SecurityException("INVALID_MODEL_FILENAME");
            source = https(value.getString("source")); licenseUrl = https(value.getString("licenseUrl"));
            trustLabel = bounded(value.getString("trustLabel"), 500);
            JSONObject p = value.getJSONObject("profile");
            exact(p, "profileId", "version", "weightsSha256", "tokenizerSha256", "templateSha256", "licenseId",
                "publisherId", "signingKeyId", "manifestSignatureBase64Url", "runtimeComponentId", "runtimeVersionCode",
                "runtimeApiMin", "runtimeApiMax", "format", "quantization", "contextTokens", "planSchemaId", "artifactBytes", "minRamBytes");
            profile = new ModelProfileManifest(p.getString("profileId"), p.getLong("version"), p.getString("weightsSha256"),
                p.getString("tokenizerSha256"), p.getString("templateSha256"), p.getString("licenseId"),
                p.getString("publisherId"), p.getString("signingKeyId"), p.getString("manifestSignatureBase64Url"),
                p.getString("runtimeComponentId"), p.getLong("runtimeVersionCode"), p.getInt("runtimeApiMin"),
                p.getInt("runtimeApiMax"), p.getString("format"), p.getString("quantization"), p.getInt("contextTokens"),
                p.getString("planSchemaId"), p.getLong("artifactBytes"), p.getLong("minRamBytes"));
            if (!java.util.Set.of("Apache-2.0", "MIT", "BSD-3-Clause").contains(profile.licenseId) || !"GGUF".equals(profile.format)
                    || profile.artifactBytes > 4_294_967_296L)
                throw new SecurityException("MODEL_LICENSE_OR_FORMAT_NOT_ACCEPTED");
        }
    }
    final Map<String, Entry> entries;
    final dev.rock.core.platform.ModelProfileAuthenticator verifier;

    LocalModelCatalog(String text) throws Exception {
        Engine.bounded(text);
        JSONObject root = new JSONObject(text); exact(root, "schema", "keys", "models");
        if (!"rock-local-model-catalog/1".equals(root.getString("schema"))) throw new SecurityException("INVALID_MODEL_CATALOG");
        JSONArray keys = root.getJSONArray("keys"), models = root.getJSONArray("models");
        if (keys.length() > 16 || models.length() > 16) throw new SecurityException("MODEL_CATALOG_TOO_LARGE");
        List<TrustedModelPublisherVerifier.PublisherKey> trusted = new ArrayList<>();
        for (int i = 0; i < keys.length(); i++) {
            JSONObject key = keys.getJSONObject(i); exact(key, "publisherId", "keyId", "publicKeyBase64Url", "revoked");
            if (!(key.get("revoked") instanceof Boolean)) throw new SecurityException("INVALID_MODEL_KEY");
            trusted.add(new TrustedModelPublisherVerifier.PublisherKey(key.getString("publisherId"), key.getString("keyId"),
                Base64.getUrlDecoder().decode(key.getString("publicKeyBase64Url")), key.getBoolean("revoked")));
        }
        verifier = new TrustedModelPublisherVerifier(trusted);
        Map<String, Entry> parsed = new LinkedHashMap<>();
        for (int i = 0; i < models.length(); i++) {
            Entry entry = new Entry(models.getJSONObject(i));
            verifier.verifySignature(entry.profile);
            if (parsed.putIfAbsent(entry.profile.profileId, entry) != null) throw new SecurityException("DUPLICATE_MODEL_PROFILE");
        }
        entries = Collections.unmodifiableMap(parsed);
    }

    LocalModelCatalog(LocalModelCatalog bundled, Map<String, Entry> admitted,
            dev.rock.core.platform.ModelProfileAuthenticator ownerVerifier) {
        Map<String, Entry> all = new LinkedHashMap<>(bundled.entries);
        for (Entry e : admitted.values()) {
            if (all.putIfAbsent(e.profile.profileId, e) != null) throw new SecurityException("ADDON_PROFILE_COLLISION");
        }
        entries = Collections.unmodifiableMap(all);
        verifier = profile -> profile.ownerPinned() ? ownerVerifier.verifySignature(profile) : bundled.verifier.verifySignature(profile);
    }

    Entry require(String profileId) {
        Entry entry = entries.get(profileId);
        if (entry == null) throw new SecurityException("MODEL_NOT_IN_TRUSTED_CATALOG");
        return entry;
    }

    private static void exact(JSONObject value, String... keys) {
        if (value.length() != keys.length) throw new SecurityException("INVALID_MODEL_CATALOG_FIELDS");
        for (String key : keys) if (!value.has(key)) throw new SecurityException("INVALID_MODEL_CATALOG_FIELDS");
    }
    private static String bounded(String value, int length) {
        if (value.isEmpty() || value.length() > length) throw new SecurityException("INVALID_MODEL_CATALOG_TEXT");
        return value;
    }
    private static String https(String value) throws Exception {
        java.net.URI uri = new java.net.URI(bounded(value, 1000));
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getFragment() != null) throw new SecurityException("INVALID_MODEL_SOURCE");
        return value;
    }
}
