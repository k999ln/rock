package dev.rock.automation;

import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.StatFs;
import android.os.SystemClock;
import android.telephony.euicc.EuiccManager;
import dev.rock.core.platform.EsimProvisioningCompatibility;
import org.json.JSONException;
import org.json.JSONObject;

/** Broker-owned, short-lived local device observation; excludes subscriber identifiers. */
final class DeviceCapabilitySnapshot {
    static final int PROTOCOL_VERSION = 3;
    static final int DEVICE_PROFILE_VERSION = 2;
    static final long VALIDITY_MS = 30_000L;

    enum Feature { SUPPORTED, UNSUPPORTED, UNKNOWN }
    enum Management { ENABLED, DISABLED, NOT_SUPPORTED, UNKNOWN }
    enum MultipleProfiles { SUPPORTED, NOT_REPORTED }

    final Feature euiccFeature;
    final Management euiccManagement;
    final MultipleProfiles multipleEnabledProfiles;
    final String managedSubscriptionManagement, automaticProfileEnablement, organizationOwnedDevice;
    final String manufacturer, model, device, product;
    final int apiLevel;
    final Long totalMemoryBytes, availableMemoryBytes, availableAppStorageBytes;
    final JSONObject hardwareFeatures;
    final long observedAt;

    private DeviceCapabilitySnapshot(Feature euiccFeature, Management euiccManagement,
        MultipleProfiles multipleEnabledProfiles, String manufacturer, String model,
        String device, String product, int apiLevel, Long totalMemoryBytes,
        Long availableMemoryBytes, Long availableAppStorageBytes, JSONObject hardwareFeatures,
        String managedSubscriptionManagement, String automaticProfileEnablement,
        String organizationOwnedDevice, long observedAt) {
        this.euiccFeature = euiccFeature;
        this.euiccManagement = euiccManagement;
        this.multipleEnabledProfiles = multipleEnabledProfiles;
        this.managedSubscriptionManagement = managedSubscriptionManagement;
        this.automaticProfileEnablement = automaticProfileEnablement;
        this.organizationOwnedDevice = organizationOwnedDevice;
        this.manufacturer = manufacturer; this.model = model; this.device = device; this.product = product;
        this.apiLevel = apiLevel;
        this.totalMemoryBytes = totalMemoryBytes; this.availableMemoryBytes = availableMemoryBytes;
        this.availableAppStorageBytes = availableAppStorageBytes; this.hardwareFeatures = hardwareFeatures;
        this.observedAt = observedAt;
    }

    static DeviceCapabilitySnapshot read(Context context) {
        return read(context, SystemClock.elapsedRealtime());
    }

    static DeviceCapabilitySnapshot read(Context context, long now) {
        DeviceCapabilitySnapshot euicc = readEuicc(context, now);
        String[] esimAdministration = readEsimAdministration(context);
        Long totalMemory = null, availableMemory = null, availableStorage = null;
        try {
            Object service = context.getSystemService(Context.ACTIVITY_SERVICE);
            if (service instanceof ActivityManager) {
                ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
                ((ActivityManager) service).getMemoryInfo(info);
                if (info.totalMem > 0 && info.availMem >= 0 && info.availMem <= info.totalMem) {
                    totalMemory = info.totalMem;
                    availableMemory = info.availMem;
                }
            }
        } catch (RuntimeException unavailable) { /* unknown stays unknown */ }
        try {
            long available = new StatFs(context.getFilesDir().getAbsolutePath()).getAvailableBytes();
            if (available >= 0) availableStorage = available;
        } catch (RuntimeException unavailable) { /* unknown stays unknown */ }

        JSONObject features = new JSONObject();
        try {
            PackageManager packages = context.getPackageManager();
            putFeature(features, packages, "input.touchscreen", PackageManager.FEATURE_TOUCHSCREEN);
            putFeature(features, packages, "input.multitouch", PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH);
            putFeature(features, packages, "input.hardware_keyboard", "android.hardware.keyboard");
            putFeature(features, packages, "audio.microphone", PackageManager.FEATURE_MICROPHONE);
            putFeature(features, packages, "camera.any", PackageManager.FEATURE_CAMERA_ANY);
            putFeature(features, packages, "camera.front", PackageManager.FEATURE_CAMERA_FRONT);
            putFeature(features, packages, "connectivity.wifi", PackageManager.FEATURE_WIFI);
            putFeature(features, packages, "connectivity.cellular", PackageManager.FEATURE_TELEPHONY);
            putFeature(features, packages, "telephony.euicc", PackageManager.FEATURE_TELEPHONY_EUICC);
            putFeature(features, packages, "telephony.euicc_mep", PackageManager.FEATURE_TELEPHONY_EUICC_MEP);
        } catch (RuntimeException unavailable) { /* absent observations are never treated as support */ }

        return new DeviceCapabilitySnapshot(euicc.euiccFeature, euicc.euiccManagement,
            euicc.multipleEnabledProfiles, reported(Build.MANUFACTURER), reported(Build.MODEL),
            reported(Build.DEVICE), reported(Build.PRODUCT), Build.VERSION.SDK_INT, totalMemory,
            availableMemory, availableStorage, features, esimAdministration[0],
            esimAdministration[1], esimAdministration[2], now);
    }

    private static String[] readEsimAdministration(Context context) {
        if (Build.VERSION.SDK_INT < 35)
            return new String[] {"unsupported", "unsupported", "unknown"};
        try {
            Object service = context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (!(service instanceof DevicePolicyManager))
                return new String[] {"unknown", "unknown", "unknown"};
            DevicePolicyManager policy = (DevicePolicyManager) service;
            boolean deviceOwner = policy.isDeviceOwnerApp(context.getPackageName());
            boolean profileOwner = policy.isProfileOwnerApp(context.getPackageName());
            boolean managedSubscriptionsPermission = context.checkSelfPermission(
                android.Manifest.permission.MANAGE_DEVICE_POLICY_MANAGED_SUBSCRIPTIONS)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
            Boolean organizationOwned = deviceOwner ? Boolean.TRUE
                : profileOwner ? policy.isOrganizationOwnedDeviceWithManagedProfile() : null;
            EsimProvisioningCompatibility result = EsimProvisioningCompatibility.classify(
                Build.VERSION.SDK_INT, deviceOwner, profileOwner,
                managedSubscriptionsPermission, organizationOwned);
            return new String[] {result.managedSubscriptionManagement,
                result.automaticProfileEnablement, result.organizationOwnedDevice};
        } catch (RuntimeException unavailable) {
            return new String[] {"unknown", "unknown", "unknown"};
        }
    }

    private static DeviceCapabilitySnapshot readEuicc(Context context, long now) {
        Boolean hasEuicc = null;
        boolean hasMultipleProfileSupport = false;
        try {
            PackageManager packages = context.getPackageManager();
            hasEuicc = packages.hasSystemFeature(PackageManager.FEATURE_TELEPHONY_EUICC);
            hasMultipleProfileSupport = packages.hasSystemFeature(PackageManager.FEATURE_TELEPHONY_EUICC_MEP);
        } catch (RuntimeException unavailable) {
            return classify(null, null, false, now);
        }
        if (!Boolean.TRUE.equals(hasEuicc)) return classify(hasEuicc, null, hasMultipleProfileSupport, now);
        try {
            Object service = context.getSystemService(Context.EUICC_SERVICE);
            if (!(service instanceof EuiccManager)) return classify(true, null, hasMultipleProfileSupport, now);
            return classify(true, ((EuiccManager) service).isEnabled(), hasMultipleProfileSupport, now);
        } catch (RuntimeException unavailable) {
            return classify(true, null, hasMultipleProfileSupport, now);
        }
    }

    private static void putFeature(JSONObject target, PackageManager packages, String key, String feature) {
        try { target.put(key, packages.hasSystemFeature(feature) ? "supported" : "unsupported"); }
        catch (RuntimeException | JSONException unavailable) {
            try { target.put(key, "unknown"); } catch (JSONException ignored) { /* fixed key is valid */ }
        }
    }

    private static String reported(String value) {
        if (value == null) return null;
        String sanitized = value.trim().replaceAll("[\\p{Cntrl}]", "");
        return sanitized.isEmpty() ? null : sanitized.substring(0, Math.min(96, sanitized.length()));
    }

    static DeviceCapabilitySnapshot classify(Boolean hasEuiccFeature, Boolean euiccEnabled,
        boolean multipleEnabledProfiles, long now) {
        if (now < 0 || now > Long.MAX_VALUE - VALIDITY_MS)
            throw new IllegalArgumentException("INVALID_OBSERVATION_TIME");
        Feature feature = hasEuiccFeature == null ? Feature.UNKNOWN
            : hasEuiccFeature ? Feature.SUPPORTED : Feature.UNSUPPORTED;
        Management management;
        if (feature == Feature.UNKNOWN) management = Management.UNKNOWN;
        else if (feature == Feature.UNSUPPORTED) management = Management.NOT_SUPPORTED;
        else if (euiccEnabled == null) management = Management.UNKNOWN;
        else management = euiccEnabled ? Management.ENABLED : Management.DISABLED;
        MultipleProfiles multiple = feature == Feature.SUPPORTED && multipleEnabledProfiles
            ? MultipleProfiles.SUPPORTED : MultipleProfiles.NOT_REPORTED;
        return new DeviceCapabilitySnapshot(feature, management, multiple, null, null, null, null,
            0, null, null, null, new JSONObject(), "unknown", "unknown", "unknown", now);
    }

    JSONObject toJson() throws JSONException { return toJson(null); }

    JSONObject toJson(JSONObject localInferenceObservation) throws JSONException {
        JSONObject profile = new JSONObject()
            .put("version", DEVICE_PROFILE_VERSION)
            .put("source", "android_public_api")
            .put("platform", "android")
            .put("apiLevel", apiLevel)
            .put("identityBasis", "android_build_reported_not_hardware_attested")
            .put("reportedIdentity", new JSONObject()
                .put("manufacturer", nullable(manufacturer)).put("model", nullable(model))
                .put("device", nullable(device)).put("product", nullable(product)))
            .put("resources", new JSONObject()
                .put("totalMemoryBytes", nullable(totalMemoryBytes))
                .put("availableMemoryBytes", nullable(availableMemoryBytes))
                .put("availableAppStorageBytes", nullable(availableAppStorageBytes)))
            .put("hardwareFeatures", hardwareFeatures)
            .put("deliveryMode", "existing_os_client")
            .put("managedSubscriptionManagement", managedSubscriptionManagement)
            .put("automaticProfileEnablement", automaticProfileEnablement)
            .put("organizationOwnedDevice", organizationOwnedDevice)
            .put("localInferenceCompatibility", "not_evaluated")
            .put("nativeOsCompatibility", "not_evaluated");
        if (localInferenceObservation == null) {
            profile.put("localInferenceObservation", new JSONObject()
                .put("state", "unknown").put("modelLoaded", JSONObject.NULL)
                .put("runtime", JSONObject.NULL).put("apiVersion", 0)
                .put("trustBasis", "unavailable").put("modelProfileIdentity", "not_reported"));
        } else {
            profile.put("localInferenceObservation", new JSONObject(localInferenceObservation.toString()));
        }
        return new JSONObject()
            .put("protocolVersion", PROTOCOL_VERSION)
            .put("scope", "local_observation")
            .put("deviceProfile", profile)
            .put("eUiccFeature", euiccFeature.name().toLowerCase(java.util.Locale.ROOT))
            .put("eUiccManagement", euiccManagement.name().toLowerCase(java.util.Locale.ROOT))
            .put("multipleEnabledProfiles", multipleEnabledProfiles.name().toLowerCase(java.util.Locale.ROOT))
            .put("managedSubscriptionManagement", managedSubscriptionManagement)
            .put("automaticProfileEnablement", automaticProfileEnablement)
            .put("organizationOwnedDevice", organizationOwnedDevice)
            .put("activeProfile", "not_inspected")
            .put("planCompatibility", "not_evaluated")
            .put("rockstarOsCompatibility", "not_evaluated")
            .put("observedAtElapsedMs", observedAt)
            .put("expiresAtElapsedMs", observedAt + VALIDITY_MS);
    }

    private static Object nullable(Object value) { return value == null ? JSONObject.NULL : value; }
}
