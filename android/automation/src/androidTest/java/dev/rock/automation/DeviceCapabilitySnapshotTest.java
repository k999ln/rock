package dev.rock.automation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class DeviceCapabilitySnapshotTest {
    @Test public void reportsUnsupportedFeatureWithoutPromotingUnexpectedEnabledValue() throws Exception {
        DeviceCapabilitySnapshot snapshot = DeviceCapabilitySnapshot.classify(false, true, true, 1000);
        assertEquals(DeviceCapabilitySnapshot.Feature.UNSUPPORTED, snapshot.euiccFeature);
        assertEquals(DeviceCapabilitySnapshot.Management.NOT_SUPPORTED, snapshot.euiccManagement);
        assertEquals(DeviceCapabilitySnapshot.MultipleProfiles.NOT_REPORTED, snapshot.multipleEnabledProfiles);
        assertEquals("not_inspected", snapshot.toJson().getString("activeProfile"));
    }

    @Test public void distinguishesDisabledAndEnabledEuiccManagement() {
        DeviceCapabilitySnapshot disabled = DeviceCapabilitySnapshot.classify(true, false, false, 1000);
        DeviceCapabilitySnapshot enabled = DeviceCapabilitySnapshot.classify(true, true, true, 1000);
        assertEquals(DeviceCapabilitySnapshot.Management.DISABLED, disabled.euiccManagement);
        assertEquals(DeviceCapabilitySnapshot.Management.ENABLED, enabled.euiccManagement);
        assertEquals(DeviceCapabilitySnapshot.MultipleProfiles.SUPPORTED, enabled.multipleEnabledProfiles);
    }

    @Test public void reportsUnknownWhenFeatureOrManagementCannotBeObserved() {
        assertEquals(DeviceCapabilitySnapshot.Feature.UNKNOWN,
            DeviceCapabilitySnapshot.classify(null, null, false, 1000).euiccFeature);
        assertEquals(DeviceCapabilitySnapshot.Management.UNKNOWN,
            DeviceCapabilitySnapshot.classify(true, null, false, 1000).euiccManagement);
    }

    @Test public void snapshotIsVersionedShortLivedAndDoesNotClaimProfileOrOsCompatibility() throws Exception {
        DeviceCapabilitySnapshot snapshot = DeviceCapabilitySnapshot.classify(true, true, false, 5000);
        org.json.JSONObject json = snapshot.toJson();
        assertEquals(3, json.getInt("protocolVersion"));
        assertEquals("local_observation", json.getString("scope"));
        org.json.JSONObject profile = json.getJSONObject("deviceProfile");
        assertEquals(2, profile.getInt("version"));
        assertEquals("android_public_api", profile.getString("source"));
        assertEquals("android_build_reported_not_hardware_attested", profile.getString("identityBasis"));
        assertEquals("existing_os_client", profile.getString("deliveryMode"));
        assertEquals("unknown", json.getString("managedSubscriptionManagement"));
        assertEquals("unknown", json.getString("automaticProfileEnablement"));
        assertEquals("not_evaluated", profile.getString("localInferenceCompatibility"));
        assertEquals("not_evaluated", profile.getString("nativeOsCompatibility"));
        assertEquals("not_inspected", json.getString("activeProfile"));
        assertEquals("not_evaluated", json.getString("planCompatibility"));
        assertEquals("not_evaluated", json.getString("rockstarOsCompatibility"));
        assertEquals(5000 + DeviceCapabilitySnapshot.VALIDITY_MS,
            json.getLong("expiresAtElapsedMs"));
        assertTrue(!json.toString().contains("ICCID") && !json.toString().contains("EID"));
        assertTrue(json.toString().contains("availableAppStorageBytes"));
        assertEquals("unknown", profile.getJSONObject("localInferenceObservation").getString("state"));
    }

    @Test public void includesOnlyExplicitlyValidatedRuntimeEvidenceAndNeverInventsModelIdentity() throws Exception {
        org.json.JSONObject runtime = new org.json.JSONObject()
            .put("state", "ready").put("modelLoaded", true).put("runtime", "llama.rn")
            .put("apiVersion", 4).put("trustBasis", "approved_package_signature_and_binder_api")
            .put("modelProfileIdentity", "not_reported");
        org.json.JSONObject profile = DeviceCapabilitySnapshot.classify(true, true, false, 5000)
            .toJson(runtime).getJSONObject("deviceProfile");
        assertEquals("ready", profile.getJSONObject("localInferenceObservation").getString("state"));
        assertEquals(true, profile.getJSONObject("localInferenceObservation").getBoolean("modelLoaded"));
        assertEquals("not_reported", profile.getJSONObject("localInferenceObservation").getString("modelProfileIdentity"));
        assertEquals("not_evaluated", profile.getString("localInferenceCompatibility"));
    }
}
