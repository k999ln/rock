package dev.rock.automation;

import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class LocalModelCatalogTest {
    private String preview() throws Exception { return new String(Files.readAllBytes(Path.of("src/debug/assets/rock-local-model-catalog.json")), java.nio.charset.StandardCharsets.UTF_8); }
    @Test public void acceptsRealPreviewSignatureButProductionInventoryIsEmpty() throws Exception {
        LocalModelCatalog catalog = new LocalModelCatalog(preview());
        assertEquals(2, catalog.entries.size());
        LocalModelCatalog.Entry entry = catalog.require("dev.rock.qwen3-06b-q8");
        assertEquals(639446688L, entry.profile.artifactBytes);
        assertEquals(4, entry.profile.runtimeApiMin);
        LocalModelCatalog.Entry larger = catalog.require("dev.rock.qwen25-15b-q4km");
        assertEquals(1117320736L, larger.profile.artifactBytes);
        assertTrue(catalog.verifier.verifySignature(larger.profile).matches("[a-f0-9]{64}"));
        assertTrue(catalog.verifier.verifySignature(entry.profile).matches("[a-f0-9]{64}"));
        assertTrue(new LocalModelCatalog(new String(Files.readAllBytes(Path.of("src/main/assets/rock-local-model-catalog.json")), java.nio.charset.StandardCharsets.UTF_8)).entries.isEmpty());
        assertThrows(SecurityException.class, () -> catalog.require("arbitrary.unknown.model"));
    }
    @Test public void rejectsTamperedWeightHashBeforeAnyImport() throws Exception {
        JSONObject source = new JSONObject(preview());
        source.getJSONArray("models").getJSONObject(0).getJSONObject("profile").put("weightsSha256", "0".repeat(64));
        assertThrows(SecurityException.class, () -> new LocalModelCatalog(source.toString()));
    }
    @Test public void revokedOrMissingPublisherCannotBecomeTrustedThroughTheManifest() throws Exception {
        JSONObject source = new JSONObject(preview());
        source.getJSONArray("keys").getJSONObject(0).put("revoked", true);
        assertThrows(SecurityException.class, () -> new LocalModelCatalog(source.toString()));
        JSONObject missing = new JSONObject(preview()); missing.put("keys", new org.json.JSONArray());
        assertThrows(SecurityException.class, () -> new LocalModelCatalog(missing.toString()));
    }
    @Test public void rejectsDuplicateProfilesUnknownFieldsAndUnacceptedLicense() throws Exception {
        JSONObject duplicate = new JSONObject(preview());
        duplicate.getJSONArray("models").put(duplicate.getJSONArray("models").getJSONObject(0));
        assertThrows(SecurityException.class, () -> new LocalModelCatalog(duplicate.toString()));
        JSONObject unknown = new JSONObject(preview()); unknown.put("allowUnsigned", true);
        assertThrows(SecurityException.class, () -> new LocalModelCatalog(unknown.toString()));
        JSONObject license = new JSONObject(preview());
        license.getJSONArray("models").getJSONObject(0).getJSONObject("profile").put("licenseId", "Unknown");
        assertThrows(SecurityException.class, () -> new LocalModelCatalog(license.toString()));
    }
}
