package dev.rock.shell;

import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.shellapi.IShellApi;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Verifies the unprivileged shell reaches state only through the exact signed Broker. */
@RunWith(AndroidJUnit4.class)
public final class ShellBrokerIntegrationTest {
    private static String selectedArticleTool(ShellConnection broker) throws Exception {
        JSONObject selected = new JSONObject(broker.selectSkyTool("article-preparation@1"));
        assertEquals("selected", selected.getString("status"));
        assertEquals("article-preparation@1", selected.getString("toolId"));
        assertEquals(1, selected.getInt("revision"));
        String token = selected.getString("selectionToken");
        JSONObject restored = new JSONObject(broker.skySelection());
        assertEquals(token, restored.getString("selectionToken"));
        return token;
    }

    @Test public void separateShellUsesSignedBrokerWithoutInternetOrLocalDatabase() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager packages = context.getPackageManager();
        assertEquals("dev.rock.shell", context.getPackageName());
        assertEquals(PackageManager.PERMISSION_DENIED,
            packages.checkPermission("android.permission.INTERNET", context.getPackageName()));
        assertEquals(PackageManager.PERMISSION_GRANTED,
            packages.checkPermission("android.permission.INTERNET", ShellConnection.BROKER_PACKAGE));
        assertEquals(PackageManager.PERMISSION_DENIED,
            packages.checkPermission("android.permission.READ_PHONE_STATE", context.getPackageName()));
        assertEquals(PackageManager.PERMISSION_GRANTED,
            packages.checkPermission("dev.rock.permission.USE_SHELL_API", context.getPackageName()));
        assertEquals(PackageManager.PERMISSION_DENIED,
            packages.checkPermission("dev.rock.permission.MANAGE_PLATFORM", context.getPackageName()));
        assertEquals(PackageManager.SIGNATURE_MATCH,
            packages.checkSignatures(context.getPackageName(), ShellConnection.BROKER_PACKAGE));

        ShellConnection broker = new ShellConnection(context);
        assertEquals(IShellApi.API_VERSION, ShellConnection.API_VERSION);
        JSONObject invalidEsimChallenge = new JSONObject(
            broker.provisionEsimGatewayKey("{\"state\":\"challenge_issued\"}", false));
        assertEquals("blocked", invalidEsimChallenge.getString("state"));
        assertEquals("CHALLENGE_INVALID", invalidEsimChallenge.getString("error"));
        JSONObject before = new JSONObject(broker.snapshot());
        assertEquals(1, before.getInt("apiVersion"));
        assertTrue(before.has("totalWorkCount"));
        assertTrue(before.has("truncated"));
        JSONObject capabilities = before.getJSONObject("deviceCapabilities");
        assertEquals(2, capabilities.getInt("protocolVersion"));
        assertEquals("local_observation", capabilities.getString("scope"));
        JSONObject deviceProfile = capabilities.getJSONObject("deviceProfile");
        assertEquals("android_public_api", deviceProfile.getString("source"));
        assertEquals("android", deviceProfile.getString("platform"));
        assertEquals("android_build_reported_not_hardware_attested", deviceProfile.getString("identityBasis"));
        assertEquals("existing_os_client", deviceProfile.getString("deliveryMode"));
        assertEquals("not_evaluated", deviceProfile.getString("localInferenceCompatibility"));
        JSONObject localInference = deviceProfile.getJSONObject("localInferenceObservation");
        assertTrue(java.util.Set.of("ready", "no_model", "loading", "busy", "error", "unknown")
            .contains(localInference.getString("state")));
        assertEquals("not_reported", localInference.getString("modelProfileIdentity"));
        assertEquals("not_evaluated", deviceProfile.getString("nativeOsCompatibility"));
        assertTrue(deviceProfile.getInt("apiLevel") > 0);
        assertTrue(deviceProfile.getJSONObject("hardwareFeatures").has("connectivity.wifi"));
        assertTrue(deviceProfile.getJSONObject("resources").has("availableAppStorageBytes"));
        assertTrue(java.util.Set.of("supported", "unsupported", "unknown")
            .contains(capabilities.getString("eUiccFeature")));
        assertTrue(java.util.Set.of("enabled", "disabled", "not_supported", "unknown")
            .contains(capabilities.getString("eUiccManagement")));
        assertEquals("not_inspected", capabilities.getString("activeProfile"));
        assertEquals("not_evaluated", capabilities.getString("planCompatibility"));
        assertEquals("not_evaluated", capabilities.getString("rockstarOsCompatibility"));
        assertTrue(capabilities.getLong("expiresAtElapsedMs") > capabilities.getLong("observedAtElapsedMs"));
        assertFalse(capabilities.toString().contains("ICCID"));
        assertFalse(capabilities.toString().contains("EID"));
        assertTrue(selectedArticleTool(broker).matches("[0-9a-f-]{36}"));
        JSONObject recovery = new JSONObject(broker.recoveryStatus());
        assertEquals("ok", recovery.getString("status"));
        assertEquals("avocadoos-recoverable-backup/2", recovery.getString("format"));
        assertFalse(recovery.getBoolean("walletSeed"));
        String input = new JSONObject()
            .put("markdown", "# Test\n\nSource ([A](https://example.test/source))\n\nDetails")
            .put("summary", "- one\n- two\n- three")
            .put("afterChars", 4).put("price", 500)
            .put("paidContents", "Details")
            .put("noteUrl", "https://note.com/example/n/test_article").toString();
        String workId = broker.submit(UUID.randomUUID().toString(), input, false, true);
        assertTrue(workId.matches("[0-9a-f-]{36}"));
        try {
            JSONObject after = new JSONObject(broker.snapshot());
            assertTrue(after.toString().contains(workId));
        } finally {
            broker.cancel(workId);
        }
    }

    @Test public void zemaCommitsOneVerifiedPlanOrNoWorkAtAll() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        String selectionToken = selectedArticleTool(broker);
        String localAiState = broker.localAiStatus();
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        JSONObject response = new JSONObject(broker.submitZema(UUID.randomUUID().toString(),
            selectionToken,
            "検証用の記事原稿と要約を準備して。無料部分の後に詳しい本文も残してください。",
            "[]", true));
        assertEquals(3, response.length());
        assertTrue(response.has("status"));
        assertTrue(response.has("code"));
        assertTrue(response.has("workId"));
        JSONObject after = new JSONObject(broker.snapshot());
        assertNotNull("Binder must return a bounded runtime state, never a null parcel", localAiState);
        assertTrue(java.util.Set.of("ready", "no_model", "loading", "busy", "error").contains(localAiState));
        // No signed profile was activated in this test. Profile validation precedes runtime contact.
        assertEquals("blocked", response.getString("status"));
        assertEquals("MODEL_PROFILE_NOT_ACTIVE", response.getString("code"));
        assertTrue(response.isNull("workId"));
        assertEquals(before, after.getInt("totalWorkCount"));
        System.out.println("ZEMA_RESULT=BLOCKED_WITHOUT_VERIFIED_PROFILE");
    }

    @Test public void zemaRequiresConsentBeforeCallingLocalAiOrCreatingWork() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        String selectionToken = selectedArticleTool(broker);
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        JSONObject response = new JSONObject(broker.submitZema(UUID.randomUUID().toString(),
            selectionToken, "This must not reach Local AI.", "[]", false));
        assertEquals("blocked", response.getString("status"));
        assertEquals("DENIED", response.getString("code"));
        assertTrue(response.isNull("workId"));
        assertEquals(before, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
    }

    @Test public void zemaRejectsAnUnpersistedSkySelectionWithoutCreatingWork() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        selectedArticleTool(broker);
        int before = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        JSONObject response = new JSONObject(broker.submitZema(UUID.randomUUID().toString(),
            UUID.randomUUID().toString(), "This must not reach Local AI.", "[]", true));
        assertEquals("blocked", response.getString("status"));
        assertEquals("SKY_SELECTION_REQUIRED", response.getString("code"));
        assertTrue(response.isNull("workId"));
        assertEquals(before, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
    }

    @Test public void recoverySetupConfirmsSelectedWordsAndExportsV2WithoutNetwork() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShellConnection broker = new ShellConnection(context);
        JSONObject setup = new JSONObject(broker.beginRecoverySetup());
        assertEquals("confirmation_required", setup.getString("status"));
        assertFalse(setup.getBoolean("walletSeed"));
        String[] phrase = setup.getString("phrase").split(" ");
        assertEquals(24, phrase.length);
        JSONArray numbers = setup.getJSONArray("confirmWordNumbers");
        JSONArray confirmations = new JSONArray();
        for (int index = 0; index < numbers.length(); index++) {
            confirmations.put(phrase[numbers.getInt(index) - 1]);
        }
        JSONObject configured = new JSONObject(broker.confirmRecoverySetup(
            setup.getString("setupToken"), confirmations.toString()));
        assertEquals(configured.toString(), "configured", configured.getString("status"));
        assertFalse(configured.getBoolean("walletSeed"));
        boolean recoverySecretHardwareBacked =
            configured.getBoolean("recoverySecretHardwareBacked");

        File destination = new File(context.getCacheDir(),
            "backup-" + UUID.randomUUID() + ".arb");
        JSONObject exported;
        try (ParcelFileDescriptor output = ParcelFileDescriptor.open(destination,
                 ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE |
                 ParcelFileDescriptor.MODE_WRITE_ONLY)) {
            exported = new JSONObject(broker.createRecoverableBackup(
                "shell-backup:" + UUID.randomUUID(), output));
        }
        byte[] envelope;
        try (FileInputStream input = new FileInputStream(destination);
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            input.transferTo(bytes); envelope = bytes.toByteArray();
        } finally {
            assertTrue(destination.delete() || !destination.exists());
        }
        assertEquals(exported.toString(), "exported", exported.getString("status"));
        assertEquals(envelope.length, exported.getInt("bytes"));
        assertTrue(envelope.length > 256);
        assertTrue(exported.getString("sha256").matches("[a-f0-9]{64}"));
        assertTrue(exported.getBoolean("storageSyncConfirmed"));
        boolean deviceWrapHardwareBacked = exported.getBoolean("hardwareBacked");
        boolean storageSyncConfirmed = exported.getBoolean("storageSyncConfirmed");
        String acceptanceTarget = InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget", "physical");
        if ("emulator".equals(acceptanceTarget)) {
            assertTrue("emulator profile requires an actual Android emulator",
                java.util.Set.of("ranchu", "goldfish").contains(Build.HARDWARE));
            assertFalse("emulator evidence cannot claim a physical recovery key", recoverySecretHardwareBacked);
            assertFalse("emulator evidence cannot claim a physical device-wrap key", deviceWrapHardwareBacked);
            System.out.println("BACKUP_ACCEPTANCE_TARGET=EMULATOR_SOFTWARE_KEYSTORE");
        } else {
            assertEquals("physical", acceptanceTarget);
            assertTrue(recoverySecretHardwareBacked);
            assertTrue(deviceWrapHardwareBacked);
            System.out.println("BACKUP_ACCEPTANCE_TARGET=PHYSICAL_HARDWARE_KEYSTORE");
        }
        assertEquals("avocadoos-recoverable-backup/2",
            new JSONObject(broker.recoveryStatus()).getString("format"));
        System.out.println("AVOCADO_BACKUP_V2=EXPORTED");
        System.out.println("RECOVERY_SECRET_HARDWARE_BACKED=" + recoverySecretHardwareBacked);
        System.out.println("DEVICE_WRAP_HARDWARE_BACKED=" + deviceWrapHardwareBacked);
        System.out.println("BACKUP_STORAGE_SYNC_CONFIRMED=" + storageSyncConfirmed);
    }
}
