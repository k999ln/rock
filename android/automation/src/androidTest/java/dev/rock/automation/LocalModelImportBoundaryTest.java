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

/** Real Android trust/storage boundaries and explicitly opted-in physical model diagnostics. */
@RunWith(AndroidJUnit4.class)
public final class LocalModelImportBoundaryTest {
    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    private PlatformStore platform() { return ((RockApplication) context().getApplicationContext()).platform(); }
    @Test public void catalogSignatureVerifiesOnAndroidAndUnlistedModelsAreRejected() throws Exception {
        LocalModelCatalog catalog = new LocalModelInstaller(context(), platform()).catalog();
        assertTrue(catalog.entries.size() >= 4);
        assertTrue(catalog.entries.containsKey("dev.rock.qwen25-coder-15b-q4km"));
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
    @Test public void explicitlyProbeFiveConciseIdeasWithoutCreatingWork() throws Exception {
        org.junit.Assume.assumeTrue("explicit synthetic performance diagnosis", "true".equals(InstrumentationRegistry.getArguments().getString("rockFiveIdeaProbe")));
        String id=InstrumentationRegistry.getArguments().getString("rockSyntheticIdeaWork");
        RockApplication app=(RockApplication)context().getApplicationContext();
        assertEquals(20,dev.rock.sdk.LocalIdeaBatch.state(app.engine().checkpoint(id)).getInt("target"));
        dev.rock.core.Engine.ModelProfilePin pin=app.engine().modelProfilePinForWork(AndroidOwner.current(context()),id);
        assertTrue(java.util.Set.of("dev.rock.qwen25-15b-q4km","dev.rock.qwen3-4b-2507-q4km").contains(pin.profileId));
        LocalAiConnection runtime=new LocalAiConnection(context());runtime.requireReadyForPlanning(pin);
        long started=android.os.SystemClock.elapsedRealtime();
        String prompt="true".equals(InstrumentationRegistry.getArguments().getString("rockUseSavedIdeaPrompt")) ? dev.rock.sdk.LocalIdeaBatch.promptPart(app.engine().checkpoint(id),1,5) : "Skyはエージェントの接続ハブです。暮らしに使えるサービスを日本語で5件。各案は12文字以内。JSONのideas配列だけを返す。";
        LocalAiConnection.Result result=runtime.plan(java.util.UUID.randomUUID().toString(),pin,"local-work@1/ideas-5-v1",prompt, "[]");
        org.json.JSONObject receipt=new org.json.JSONObject().put("event",result.event).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-started).put("payload",result.payload);
        Files.write(new File(context().getExternalFilesDir(null),"synthetic-five-ideas.json").toPath(),receipt.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals("completed",result.event);dev.rock.sdk.LocalWorkDraft.verify("planning",result.payload);
    }
    @Test public void explicitlyDiagnoseOnlyPublicModelConnectivity() throws Exception {
        org.junit.Assume.assumeTrue("explicit public-origin connectivity diagnosis", "true".equals(InstrumentationRegistry.getArguments().getString("rockPublicConnectivity")));
        org.json.JSONArray results=new org.json.JSONArray();
        for(String url:new String[]{"https://api.github.com/search/repositories?q=Qwen+GGUF&per_page=1","https://huggingface.co/api/models?search=Qwen2.5&limit=1"}) {
            org.json.JSONObject entry=new org.json.JSONObject().put("origin",java.net.URI.create(url).getHost());
            try {PublicModelDiscovery.Reply r=PublicModelDiscovery.https(url);entry.put("status",r.status).put("bytes",r.body.length());}
            catch(Exception e){entry.put("exception",e.getClass().getSimpleName());if(e.getCause()!=null)entry.put("cause",e.getCause().getClass().getSimpleName());}
            results.put(entry);
        }
        Files.write(new File(context().getExternalFilesDir(null),"public-connectivity-diagnosis.json").toPath(),results.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    @Test public void readOnlyTheSyntheticTwentyIdeaCheckpoint() throws Exception {
        org.junit.Assume.assumeTrue("explicit synthetic saved-prefix readback", "true".equals(InstrumentationRegistry.getArguments().getString("rockReadSyntheticPrefix")));
        String id=InstrumentationRegistry.getArguments().getString("rockSyntheticIdeaWork");
        String checkpoint=((RockApplication)context().getApplicationContext()).engine().checkpoint(id);
        assertEquals(20,dev.rock.sdk.LocalIdeaBatch.state(checkpoint).getInt("target"));
        Files.write(new File(context().getExternalFilesDir(null),"synthetic-twenty-checkpoint.json").toPath(),checkpoint.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    @Test public void readOnlyPhysicalMigrationHashes() throws Exception {
        org.junit.Assume.assumeTrue("explicit physical hash-only migration readback", "true".equals(InstrumentationRegistry.getArguments().getString("rockMigrationReadback")));
        org.json.JSONArray works=new org.json.JSONArray(),artifacts=new org.json.JSONArray();
        try(AndroidDatabase db=new AndroidDatabase(context())) {
            for(java.util.Map<String,String> row:db.query("SELECT id FROM works ORDER BY id"))works.put(row.get("id"));
            for(java.util.Map<String,String> row:db.query("SELECT work_id,digest,body FROM artifacts ORDER BY work_id,digest")) {
                assertEquals("every stored body must match its digest",row.get("digest"),dev.rock.core.Engine.digest(row.get("body")));
                artifacts.put(new org.json.JSONObject().put("workId",row.get("work_id")).put("digest",row.get("digest")));
            }
            org.json.JSONObject result=new org.json.JSONObject().put("engineSchema",Integer.parseInt(db.query("SELECT version FROM rock_meta").get(0).get("version")))
                .put("works",works).put("artifacts",artifacts).put("allBodyDigestsVerified",true);
            Files.write(new File(context().getExternalFilesDir(null),"migration-hash-readback.json").toPath(),result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }
    private String active() {
        dev.rock.core.platform.ModelProfileManifest active = platform().activeModelProfile();
        return active == null ? null : active.digest();
    }
}
