package dev.rock.shell;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.BatteryManager;
import android.os.SystemClock;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Opt-in physical inference, never a fixture. Model weights must first be owner-installed through Sky. */
@RunWith(AndroidJUnit4.class)
public final class DiscoveredModelAcceptanceTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private Context context() { return instrumentation.getTargetContext(); }
    private void ui(Runnable r) { instrumentation.runOnMainSync(r); }
    private Object field(Object target, String name) {
        try { Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true); return f.get(target); }
        catch (Exception e) { throw new AssertionError(e); }
    }
    private void call(MainActivity activity, String name) {
        try { Method m = MainActivity.class.getDeclaredMethod(name); m.setAccessible(true); m.invoke(activity); }
        catch (Exception e) { throw new AssertionError(e); }
    }
    private static String hash(String text) throws Exception {
        StringBuilder out = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))) out.append(String.format(Locale.ROOT,"%02x", b & 255)); return out.toString();
    }
    private static android.view.View find(android.view.View root, java.util.function.Predicate<android.view.View> test) {
        if (test.test(root)) return root;
        if (root instanceof android.view.ViewGroup) for (int i=0;i<((android.view.ViewGroup)root).getChildCount();i++) {
            android.view.View result = find(((android.view.ViewGroup)root).getChildAt(i),test); if(result!=null)return result;
        }
        return null;
    }
    private static Button button(android.view.View root, String label) {
        return (Button)find(root,v -> v instanceof Button && label.contentEquals(((Button)v).getText()));
    }
    @Test public void searchThenOwnerDownloadAndVerifiedInstallationOnPixel() throws Exception {
        Assume.assumeTrue("large physical Wi-Fi download is opt-in", "true".equals(InstrumentationRegistry.getArguments().getString("rockDownloadAcceptance")));
        assertEquals("frankel", android.os.Build.DEVICE);
        assertFalse(context().getSystemService(android.app.KeyguardManager.class).isDeviceLocked());
        ShellConnection broker = new ShellConnection(context());
        boolean coder = "coder".equals(InstrumentationRegistry.getArguments().getString("rockDownloadModel", "coder"));
        String id = coder ? "dev.rock.qwen25-coder-15b-q4km" : "dev.rock.qwen25-15b-q4km";
        boolean reviewedCatalog="true".equals(InstrumentationRegistry.getArguments().getString("rockUseReviewedCatalog"));
        String query = coder ? "Qwen2.5-Coder-1.5B-Instruct-GGUF" : "Qwen2.5-1.5B-Instruct-GGUF";
        JSONObject prepared = new JSONObject(broker.preparePublicModelInstall(id)); assertEquals("prepared",prepared.optString("status"));
        int jobs = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        MainActivity activity = (MainActivity)instrumentation.startActivitySync(new Intent(context(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long start = SystemClock.elapsedRealtime();
        try {
            ui(() -> activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            if (reviewedCatalog) {
                ui(() -> { try { Method m=MainActivity.class.getDeclaredMethod("preparePublicModelInstall",String.class);m.setAccessible(true);m.invoke(activity,id); } catch(Exception e){throw new AssertionError(e);} });
            } else {
            ui(() -> {
                try { Method m = MainActivity.class.getDeclaredMethod("selectPage", int.class); m.setAccessible(true); m.invoke(activity,1); } catch(Exception e){throw new AssertionError(e);}
                ((EditText)field(activity,"discoveryQuery")).setText(query);
                ((Button)field(activity,"discoverySearch")).performClick();
            });
            AtomicReference<Button> install = new AtomicReference<>(); long deadline = SystemClock.elapsedRealtime()+30000;
            do { ui(() -> install.set(button((android.view.View)field(activity,"discoveryResults"),"条件を確認してPixelへ導入"))); if(install.get()==null)SystemClock.sleep(250); } while(install.get()==null && SystemClock.elapsedRealtime()<deadline);
            assertNotNull("live public result must map to the reviewed catalog",install.get()); ui(() -> install.get().performClick());
            }
            AtomicReference<Button> begin = new AtomicReference<>(); long deadline=SystemClock.elapsedRealtime()+10000;
            do {
                ui(() -> { for(android.view.View root:android.view.inspector.WindowInspector.getGlobalWindowViews()) {
                    Button b=button(root,"取得を始める"); if(b!=null && !b.isEnabled()){
                        assertFalse("owner consent is initially unchecked",b.isEnabled());
                        CheckBox c=(CheckBox)find(root,v -> v instanceof CheckBox && ((CheckBox)v).getText().toString().startsWith("ライセンスと容量"));
                        assertNotNull(c); assertFalse("owner checkbox is initially unchecked",c.isChecked()); c.setChecked(true); begin.set(b); break;
                    }
                }}); if(begin.get()==null)SystemClock.sleep(100);
            } while(begin.get()==null && SystemClock.elapsedRealtime()<deadline);
            assertNotNull("review license and size in real dialog",begin.get()); ui(() -> begin.get().performClick());
            JSONObject state=null; deadline=SystemClock.elapsedRealtime()+1200000; boolean actualNetwork=false;
            while(SystemClock.elapsedRealtime()<deadline) {
                state=new JSONObject(broker.publicModelInstallStatus());
                if(id.equals(state.optString("profileId"))) {
                    actualNetwork|=state.optLong("bytesDownloaded")>0;
                    Files.write(new File(context().getExternalFilesDir(null),"download-"+(coder?"coder":"general")+"-progress.json").toPath(),state.toString().getBytes(StandardCharsets.UTF_8));
                    assertFalse("download failure: "+state,"failed".equals(state.optString("status")));
                    if("downloaded".equals(state.optString("status")))break;
                }
                SystemClock.sleep(1000);
            }
            assertNotNull(state); assertEquals(state.toString(),"downloaded",state.getString("status"));
            if(coder && !reviewedCatalog)assertFalse("new coder must come from actual download",state.getBoolean("cachedSource"));
            ui(() -> call(activity,"refreshModelDownload"));
            AtomicReference<Button> finish=new AtomicReference<>();deadline=SystemClock.elapsedRealtime()+10000;
            do { ui(() -> finish.set(button((android.view.View)field(activity,"modelDownloadPanel"),"検証してPixelへ導入")));if(finish.get()==null)SystemClock.sleep(100); }while(finish.get()==null&&SystemClock.elapsedRealtime()<deadline);
            assertNotNull(finish.get());ui(() -> finish.get().performClick());
            deadline=SystemClock.elapsedRealtime()+900000;
            do {state=new JSONObject(broker.publicModelInstallStatus());if("installed".equals(state.optString("status")))break;assertFalse(state.toString(),"failed".equals(state.optString("status")));SystemClock.sleep(1000);}while(SystemClock.elapsedRealtime()<deadline);
            assertEquals(state.toString(),"installed",state.getString("status"));
            JSONObject matching=null;JSONArray catalog=new JSONObject(broker.localModelCatalog()).getJSONArray("models");
            for(int i=0;i<catalog.length();i++)if(id.equals(catalog.getJSONObject(i).getString("profileId")))matching=catalog.getJSONObject(i);
            assertNotNull(matching);assertTrue(matching.getBoolean("cached"));assertTrue(matching.getBoolean("licenseAccepted"));assertTrue(matching.getBoolean("activeProfile"));
            assertEquals(jobs,new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
            JSONObject receipt=new JSONObject().put("status","passed").put("profile",matching).put("download",state).put("prepared",prepared).put("liveSearchButton",!reviewedCatalog).put("explicitLicenseConsent",true).put("realDownloadObserved",actualNetwork).put("elapsedMs",SystemClock.elapsedRealtime()-start).put("createdWork",false);
            Files.write(new File(context().getExternalFilesDir(null),"download-"+(coder?"coder":"general")+"-receipt.json").toPath(),receipt.toString().getBytes(StandardCharsets.UTF_8));
        } finally {ui(activity::finish);}
    }
    @Test public void cancelOnlyTransferredCoderDuplicateDownload() throws Exception {
        Assume.assumeTrue("explicit duplicate download cleanup", "true".equals(InstrumentationRegistry.getArguments().getString("rockTransferredCleanup")));
        ShellConnection broker=new ShellConnection(context());JSONObject current=new JSONObject(broker.publicModelInstallStatus());
        assertEquals("dev.rock.qwen25-coder-15b-q4km",current.getString("profileId"));
        JSONObject ready=new JSONObject(broker.prepareLocalModelChoice("auto","Pythonのコードを書いて"));assertEquals("prepared",ready.getString("status"));assertEquals(current.getString("profileId"),ready.getString("profileId"));
        assertEquals("cancelled",new JSONObject(broker.cancelPublicModelDownload(current.getString("operationId"))).getString("status"));
    }
    @Test public void cancelOnlyTheSyntheticCodeProbe() throws Exception {
        Assume.assumeTrue("explicit synthetic probe cleanup", "true".equals(InstrumentationRegistry.getArguments().getString("rockCodeProbeCleanup")));
        JSONObject receipt=new JSONObject(new String(Files.readAllBytes(new File(context().getExternalFilesDir(null),"discovered-code-receipt.json").toPath()),StandardCharsets.UTF_8));
        JSONObject work=receipt.getJSONObject("work"); assertEquals("code",receipt.getString("task"));
        assertEquals("dev.rock.qwen25-coder-15b-q4km",work.getJSONObject("planner").getString("profileId"));
        new ShellConnection(context()).cancel(work.getString("id"));
    }
    @Test public void cancelOnlyTheSyntheticTwentyIdeaProbe() throws Exception {
        Assume.assumeTrue("explicit probe cleanup only", "true".equals(InstrumentationRegistry.getArguments().getString("rockProbeCleanup")));
        JSONObject receipt=new JSONObject(new String(Files.readAllBytes(new File(context().getExternalFilesDir(null),"discovered-ideas-receipt.json").toPath()), StandardCharsets.UTF_8));
        JSONObject work=receipt.getJSONObject("work");assertEquals(20,work.getJSONObject("ideaProgress").getInt("target"));
        new ShellConnection(context()).cancel(work.getString("id"));
    }
    @Test public void installPreparationAndRefusalsDoNotDownloadOrCreateWork() throws Exception {
        ShellConnection broker = new ShellConnection(context());
        String before = broker.publicModelInstallStatus(); int works = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        JSONObject denied = new JSONObject(broker.beginPublicModelDownload("arbitrary.unknown.model", false));
        assertEquals("failed", denied.getString("status")); assertEquals("MODEL_IMPORT_CONSENT_REQUIRED", denied.getString("code"));
        assertEquals("MODEL_NOT_IN_TRUSTED_CATALOG", new JSONObject(broker.preparePublicModelInstall("arbitrary.unknown.model")).getString("code"));
        JSONObject after = new JSONObject(broker.publicModelInstallStatus()), previous = new JSONObject(before);
        assertEquals(previous.optString("operationId"), after.optString("operationId"));
        assertEquals(previous.optString("profileId"), after.optString("profileId"));
        if ("idle".equals(previous.optString("status"))) assertEquals("idle", after.getString("status"));
        assertEquals(works, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
    }
    @Test public void realHomeRequestRoutesExactInstalledModelAndPersistsVerifiedDraft() throws Exception {
        Assume.assumeTrue("explicit physical acceptance only", "true".equals(InstrumentationRegistry.getArguments().getString("rockDiscoveredAcceptance")));
        assertEquals("frankel", android.os.Build.DEVICE);
        assertTrue(context().getSystemService(BatteryManager.class).isCharging());
        assertFalse(context().getSystemService(android.app.KeyguardManager.class).isDeviceLocked());
        ShellConnection broker = new ShellConnection(context()); JSONObject initial = new JSONObject(broker.snapshot()); assertFalse(initial.getBoolean("paused"));
        String mode = InstrumentationRegistry.getArguments().getString("rockTask", "code");
        int target = Integer.parseInt(InstrumentationRegistry.getArguments().getString("rockIdeas", "300"));
        String prompt = "ideas".equals(mode) ? "RockstarOS・Skyで実現するサービスのアイデアを" + target + "件出して。暮らし・仕事・創作・Mini・家具・建築とつながる具体的なサービスを日本語で。"
            : "summary".equals(mode) ? "次の文章を日本語で短く要約して。SkyはエージェントやLLMのマーケットプレイスと接続ハブ。Zemaは仕事の依頼、進捗、承認、成果、使用額を管理する。"
            : "translation".equals(mode) ? "次の文を英語に翻訳して。Skyは暮らしと仕事をつなぎます。"
            : "Pythonで、整数の配列を受け取り偶数だけの合計を返す関数sum_evenのコードを書いて。コードは実行しない。";
        String expected = "code".equals(mode) ? "dev.rock.qwen25-coder-15b-q4km" : "dev.rock.qwen25-15b-q4km";
        String choice=InstrumentationRegistry.getArguments().getString("rockModelChoice","auto");
        JSONObject prepared = new JSONObject(broker.prepareLocalModelChoice(choice, prompt));
        assertEquals(prepared.toString(), "prepared", prepared.optString("status")); assertEquals(expected, prepared.getString("profileId"));
        Set<String> before = new HashSet<>(); JSONArray old = initial.getJSONArray("works");
        for (int i = 0; i < old.length(); i++) before.add(old.getJSONObject(i).getString("id"));
        String previousChoice = context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).getString("preferredLocalModel", "auto");
        context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).edit().putString("preferredLocalModel", choice).commit();
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(new Intent(context(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String created = InstrumentationRegistry.getArguments().getString("rockResumeWork"); JSONObject work = null;
        File dir = context().getExternalFilesDir(null); long start = SystemClock.elapsedRealtime();
        try {
            ui(() -> activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            if (created != null) {
                JSONObject saved = null; JSONArray savedWorks = new JSONObject(broker.snapshot()).getJSONArray("works");
                for(int i=0;i<savedWorks.length();i++)if(created.equals(savedWorks.getJSONObject(i).getString("id")))saved=savedWorks.getJSONObject(i);
                assertNotNull("resume only the existing owner-requested work",saved);
                boolean held=false;JSONArray savedRuns=saved.getJSONArray("runs");for(int i=0;i<savedRuns.length();i++)held|=java.util.Set.of("failed","needs_review").contains(savedRuns.getJSONObject(i).getString("state"));
                String readiness=broker.localAiStatus();
                if(!"ready".equals(readiness)&&!"busy".equals(readiness))assertEquals("ready",new JSONObject(broker.reloadLocalModel(expected,true)).getString("status"));
                if(held)broker.retry(created);
            }
            if (created == null) {
                ui(() -> { ((EditText) field(activity, "homePrompt")).setText(prompt); ((RadioGroup) field(activity, "homeExecutionChoice")).check(3100); call(activity, "prepareHomeRequest"); });
                AtomicReference<String> digest = new AtomicReference<>(); long deadline = SystemClock.elapsedRealtime() + 15000;
                do { ui(() -> digest.set((String) field(activity,"preparedModelDigest"))); if (digest.get() == null) SystemClock.sleep(100); } while(digest.get() == null && SystemClock.elapsedRealtime() < deadline);
                assertEquals(prepared.getString("manifestDigest"), digest.get());
                assertEquals(initial.getInt("totalWorkCount"), new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
                ui(() -> { assertFalse(((CheckBox) field(activity,"zemaConsent")).isChecked()); ((CheckBox) field(activity,"zemaConsent")).setChecked(true); Button button = (Button) field(activity,"zemaSubmitButton"); button.performClick(); button.performClick(); });
            }
            long deadline = SystemClock.elapsedRealtime() + ("ideas".equals(mode) ? 3600000 : 300000);
            int completed = 0;
            while (SystemClock.elapsedRealtime() < deadline) {
                JSONObject snapshot = new JSONObject(broker.snapshot()); JSONArray works = snapshot.getJSONArray("works");
                for (int i = 0; i < works.length(); i++) {
                    JSONObject candidate = works.getJSONObject(i);
                    if (created == null && !before.contains(candidate.getString("id"))) created = candidate.getString("id");
                    if (candidate.getString("id").equals(created)) work = candidate;
                }
                if (work != null) {
                    assertEquals(expected, work.getJSONObject("planner").getString("profileId"));
                    assertEquals(prepared.getString("manifestDigest"), work.getJSONObject("planner").getString("manifestDigest"));
                    JSONObject progress = work.optJSONObject("ideaProgress"); if (progress != null) { assertTrue(progress.getInt("completed") >= completed); completed = progress.getInt("completed"); }
                    JSONObject receipt = new JSONObject().put("task", mode).put("workId", created).put("work", work).put("elapsedMs", SystemClock.elapsedRealtime()-start).put("physicalInference", true);
                    Files.write(new File(dir, "discovered-"+mode+"-receipt.json").toPath(), receipt.toString().getBytes(StandardCharsets.UTF_8));
                    if ("review".equals(work.optString("state"))) break;
                    JSONArray runs = work.getJSONArray("runs"); for (int i=0;i<runs.length();i++) assertFalse("generation stopped; checkpoint preserved: "+work, java.util.Set.of("failed","needs_review").contains(runs.getJSONObject(i).optString("state")));
                }
                SystemClock.sleep(1000);
            }
            assertNotNull("Home must create one persisted job", work); assertEquals(work.toString(), "review", work.getString("state"));
            JSONArray runs = work.getJSONArray("runs"); for(int i=0;i<runs.length();i++) assertEquals("succeeded", runs.getJSONObject(i).getString("state"));
            String artifact = broker.result(created); assertFalse(artifact.isBlank()); assertFalse(artifact.contains("<think>"));
            if ("ideas".equals(mode)) { assertEquals(target, artifact.split("(?m)^\\d+\\. ", -1).length-1); assertEquals(target, work.getJSONObject("ideaProgress").getInt("completed")); }
            if ("code".equals(mode)) { assertTrue(artifact.contains("sum_even")); assertTrue(artifact.contains("return")); }
            Files.write(new File(dir, "discovered-"+mode+"-artifact.md").toPath(), artifact.getBytes(StandardCharsets.UTF_8));
            JSONObject receipt = new JSONObject().put("status","passed").put("choice",choice).put("resumedExistingWork",InstrumentationRegistry.getArguments().getString("rockResumeWork")!=null).put("task",mode).put("workId",created).put("work",work).put("artifactBytes",artifact.getBytes(StandardCharsets.UTF_8).length).put("artifactSha256",hash(artifact)).put("elapsedMs",SystemClock.elapsedRealtime()-start).put("physicalInference",true).put("humanReviewAccepted",false);
            Files.write(new File(dir,"discovered-"+mode+"-receipt.json").toPath(),receipt.toString().getBytes(StandardCharsets.UTF_8));
        } finally {
            // Requested ideas and accepted drafts remain saved; never mark human review complete here.
            context().getSharedPreferences("terminal_preferences", Context.MODE_PRIVATE).edit().putString("preferredLocalModel",previousChoice).commit();
            ui(activity::finish);
        }
    }
}
