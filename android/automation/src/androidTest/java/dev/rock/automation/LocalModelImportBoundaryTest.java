package dev.rock.automation;

import android.content.Context;
import android.os.ParcelFileDescriptor;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.platform.PlatformStore;
import java.io.File;
import java.nio.file.Files;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Android signature, descriptor and SQLite boundaries; no substitute weights or model inference. */
@RunWith(AndroidJUnit4.class)
public final class LocalModelImportBoundaryTest {
    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    private PlatformStore platform() { return ((RockApplication) context().getApplicationContext()).platform(); }
    @Test public void catalogSignatureVerifiesOnAndroidAndUnlistedModelsAreRejected() throws Exception {
        LocalModelCatalog catalog = new LocalModelInstaller(context(), platform()).catalog();
        assertEquals(3, catalog.entries.size());
        assertThrows(SecurityException.class, () -> catalog.require("not.a.catalog-model"));
    }
    @Test public void missingConsentDoesNotReadOrActivateTheModel() throws Exception {
        File file = File.createTempFile("model-consent-", ".gguf", context().getCacheDir());
        try {
            String before = active();
            ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            try { new LocalModelInstaller(context(), platform()).install("dev.rock.qwen3-06b-q8", fd, false); fail(); }
            catch (SecurityException expected) { assertEquals("MODEL_IMPORT_CONSENT_REQUIRED", expected.getMessage()); }
            assertEquals(before, active());
        } finally { file.delete(); }
    }
    @Test public void writableOrTruncatedFileCannotActivateAProfileOrCreateWork() throws Exception {
        org.junit.Assume.assumeFalse(context().getSystemService(android.app.KeyguardManager.class).isDeviceLocked());
        File file = File.createTempFile("model-short-", ".gguf", context().getCacheDir());
        try {
            Files.write(file.toPath(), "synthetic-invalid-weight".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            String before = active();
            int jobs = ((RockApplication) context().getApplicationContext()).engine().list().size();
            for (int mode : new int[]{ParcelFileDescriptor.MODE_READ_WRITE, ParcelFileDescriptor.MODE_READ_ONLY}) {
                ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, mode);
                try { new LocalModelInstaller(context(), platform()).install("dev.rock.qwen3-06b-q8", fd, true); fail(); }
                catch (SecurityException expected) {
                    assertTrue(java.util.Set.of("READ_ONLY_REGULAR_MODEL_FILE_REQUIRED", "MODEL_FILE_LENGTH_MISMATCH")
                        .contains(expected.getMessage()));
                }
                assertEquals(before, active());
            }
            assertEquals(jobs, ((RockApplication) context().getApplicationContext()).engine().list().size());
        } finally { file.delete(); }
    }
    @Test public void selectedBytesAreHashedEvenWhenTheyHaveTheExpectedLength() throws Exception {
        File file = File.createTempFile("model-hash-", ".gguf", context().getCacheDir());
        try {
            byte[] bytes = "small synthetic hash boundary".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            Files.write(file.toPath(), bytes);
            dev.rock.core.platform.ModelProfileManifest profile = new dev.rock.core.platform.ModelProfileManifest(
                "test.synthetic.model", 1, dev.rock.core.Engine.digest("small synthetic hash boundary"),
                "0".repeat(64), "0".repeat(64), "Apache-2.0", "test.publisher", "test.key", "A".repeat(86),
                "org.rockstar.runtime.localai", 3, 4, 4, "GGUF", "Q8_0", 2048,
                "article-preparation@1/input-v1", bytes.length, 1000);
            try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)) {
                LocalModelInstaller.verifySelectedWeights(fd, profile);
            }
            bytes[0] ^= 1; Files.write(file.toPath(), bytes);
            try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)) {
                try { LocalModelInstaller.verifySelectedWeights(fd, profile); fail(); }
                catch (SecurityException expected) { assertEquals("MODEL_ARTIFACT_HASH_MISMATCH", expected.getMessage()); }
            }
        } finally { file.delete(); }
    }

    @Test public void explicitlyImportOfficialTransferredCoderAndReadDownloadReason() throws Exception {
        org.junit.Assume.assumeTrue("owner-approved physical transferred weight only", "true".equals(InstrumentationRegistry.getArguments().getString("rockTransferredCoder")));
        org.json.JSONArray downloads = new org.json.JSONArray(); android.app.DownloadManager manager = context().getSystemService(android.app.DownloadManager.class);
        try (android.database.Cursor rows = manager.query(new android.app.DownloadManager.Query())) {
            while(rows != null && rows.moveToNext()) {
                String description=rows.getString(rows.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_DESCRIPTION));
                if(description==null||!description.startsWith("rock-model:"))continue;
                downloads.put(new org.json.JSONObject().put("status", rows.getInt(rows.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS)))
                    .put("reason",rows.getInt(rows.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_REASON)))
                    .put("bytes",rows.getLong(rows.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))));
            }
        }
        File directory=context().getExternalFilesDir(null);
        Files.write(new File(directory,"public-download-diagnostic.json").toPath(),downloads.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String id="dev.rock.qwen25-coder-15b-q4km"; LocalModelCatalog.Entry entry=new LocalModelInstaller(context(),platform()).catalog().require(id);
        String receipt=new LocalModelInstaller(context(),platform()).install(id,ParcelFileDescriptor.open(new File(directory,entry.fileName),ParcelFileDescriptor.MODE_READ_ONLY),true);
        assertEquals("ready",new org.json.JSONObject(receipt).getString("status"));
        Files.write(new File(directory,"transferred-coder-install.json").toPath(),new org.json.JSONObject(receipt).put("acquisition","official_fixed_revision_host_download_then_adb_transfer").toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    @Test public void inspectOnlyRequestedSyntheticCodePlan() throws Exception {
        org.junit.Assume.assumeTrue("explicit synthetic model diagnostic", "true".equals(InstrumentationRegistry.getArguments().getString("rockDraftDiagnostic")));
        RockApplication app=(RockApplication)context().getApplicationContext();
        String workId=InstrumentationRegistry.getArguments().getString("rockDiagnosticWork");
        dev.rock.core.Engine.ModelProfilePin pin=app.engine().modelProfilePinForWork(AndroidOwner.current(context()),workId);
        LocalAiConnection runtime=new LocalAiConnection(context());runtime.requireReadyForPlanning(pin);
        String prompt=dev.rock.sdk.LocalWorkDraft.prompt("code", "Python function sum_even(xs): return the sum of even integers. One line only, no example usage.");
        long start=android.os.SystemClock.elapsedRealtime();
        LocalAiConnection.Result result=runtime.plan(java.util.UUID.randomUUID().toString(),pin,dev.rock.sdk.LocalWorkDraft.SCHEMA,prompt,"[]");
        File file=new File(context().getExternalFilesDir(null),"synthetic-code-plan-diagnostic.json");
        Files.write(file.toPath(),new org.json.JSONObject().put("event",result.event).put("payload",result.payload).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-start).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals("completed",result.event);dev.rock.sdk.LocalWorkDraft.verify("code",result.payload);
    }
    @Test public void enableOnlySyntheticIdeaProbeDiagnostics() throws Exception {
        org.junit.Assume.assumeTrue("explicit private synthetic diagnostic only", "true".equals(InstrumentationRegistry.getArguments().getString("rockEnableIdeaProbe")));
        String id=InstrumentationRegistry.getArguments().getString("rockSyntheticIdeaWork");RockApplication app=(RockApplication)context().getApplicationContext();
        org.json.JSONObject checkpoint=dev.rock.sdk.LocalIdeaBatch.state(app.engine().checkpoint(id));assertEquals(20,checkpoint.getInt("target"));
        assertEquals("dev.rock.qwen25-15b-q4km",app.engine().modelProfilePinForWork(AndroidOwner.current(context()),id).profileId);
        assertTrue(context().getSharedPreferences("synthetic-plan-probe",Context.MODE_PRIVATE).edit().putString("workId",id).commit());
    }
    private String active() {
        dev.rock.core.platform.ModelProfileManifest active = platform().activeModelProfile();
        return active == null ? null : active.digest();
    }
}
