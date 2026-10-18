package dev.rock.shell;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Opt-in public network + real native inference. No fixture inference or automatic timeout retry. */
@RunWith(AndroidJUnit4.class)
public final class SkyOpenAddonAcceptanceTest {
    final Instrumentation ins=InstrumentationRegistry.getInstrumentation();
    MainActivity trialActivity;
    @Before public void keepVisibleDuringPhysicalTrial(){
        physical();trialActivity=(MainActivity)ins.startActivitySync(new Intent(c(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        ui(()->trialActivity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }
    @After public void restoreWindowPolicy(){if(trialActivity!=null)ui(()->{trialActivity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);trialActivity.finish();});}
    Context c(){return ins.getTargetContext();} void ui(Runnable r){ins.runOnMainSync(r);}
    void physical(){Assume.assumeTrue("explicit physical add-on acceptance only","true".equals(InstrumentationRegistry.getArguments().getString("rockOpenAddonPhysical")));assertEquals("frankel",Build.DEVICE);assertFalse(c().getSystemService(KeyguardManager.class).isDeviceLocked());}
    Object field(MainActivity a,String n){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}catch(Exception e){throw new AssertionError(e);}}
    void call(MainActivity a,String name,String arg){try{Method m=MainActivity.class.getDeclaredMethod(name,String.class);m.setAccessible(true);m.invoke(a,arg);}catch(Exception e){throw new AssertionError(e);}}
    View find(View v,java.util.function.Predicate<View> match){if(match.test(v))return v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View x=find(((ViewGroup)v).getChildAt(i),match);if(x!=null)return x;}return null;}
    Button waitButton(String text,long ms){AtomicReference<Button> b=new AtomicReference<>();long end=SystemClock.elapsedRealtime()+ms;do{ui(()->{for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews()){View v=find(root,x->x instanceof Button&&text.contentEquals(((Button)x).getText()));if(v!=null)b.set((Button)v);}});if(b.get()==null)SystemClock.sleep(200);}while(b.get()==null&&SystemClock.elapsedRealtime()<end);assertNotNull("UI button: "+text,b.get());return b.get();}
    void consentThenClick(String positive,String prefix,long ms){Button button=waitButton(positive,ms);ui(()->{assertFalse("consent starts unchecked",button.isEnabled());for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews()){CheckBox check=(CheckBox)find(root,x->x instanceof CheckBox&&((CheckBox)x).getText().toString().startsWith(prefix));if(check!=null){assertFalse(check.isChecked());check.setChecked(true);break;}}assertTrue(button.isEnabled());button.performClick();});}
    void save(String name,String text)throws Exception{Files.write(new File(c().getExternalFilesDir(null),"open-addon-"+name).toPath(),text.getBytes(StandardCharsets.UTF_8));}
    JSONObject work(ShellConnection b,String id)throws Exception{JSONArray w=new JSONObject(b.snapshot()).getJSONArray("works");for(int i=0;i<w.length();i++)if(id.equals(w.getJSONObject(i).getString("id")))return w.getJSONObject(i);return null;}
    JSONObject awaitReview(ShellConnection b,String id,long start)throws Exception{
        JSONObject w=null;long end=SystemClock.elapsedRealtime()+300_000;
        do{w=work(b,id);if(w!=null){save("work-progress.json",new JSONObject(w.toString()).put("elapsedMs",SystemClock.elapsedRealtime()-start).toString());if("review".equals(w.optString("state")))break;
            JSONArray runs=w.getJSONArray("runs");for(int i=0;i<runs.length();i++)assertFalse("held real inference: "+runs.getJSONObject(i),Set.of("failed","needs_review").contains(runs.getJSONObject(i).optString("state")));}SystemClock.sleep(500);}while(SystemClock.elapsedRealtime()<end);
        assertNotNull(w);assertEquals(w.toString(),"review",w.getString("state"));for(int i=0;i<w.getJSONArray("runs").length();i++)assertEquals("succeeded",w.getJSONArray("runs").getJSONObject(i).getString("state"));return w;
    }
    @Test public void searchAddDownloadLoadAndGenerateWithNonBundledPublicModel()throws Exception{
        physical();ShellConnection b=new ShellConnection(c());String repo=InstrumentationRegistry.getArguments().getString("rockModelRepo","bartowski/Qwen2.5-0.5B-Instruct-GGUF");
        JSONObject search=new JSONObject(b.searchPublicModels(repo.substring(repo.indexOf('/')+1)));boolean found=false;
        JSONArray candidates=search.getJSONArray("candidates");for(int i=0;i<candidates.length();i++)found|=repo.equals(candidates.getJSONObject(i).optString("id"));assertTrue("actual public search must find selected repo",found);
        save("live-search.json",search.toString());String source="https://huggingface.co/"+repo+"/resolve/main/"+InstrumentationRegistry.getArguments().getString("rockModelFile","Qwen2.5-0.5B-Instruct-Q4_K_M.gguf");
        MainActivity activity=trialActivity;long start=SystemClock.elapsedRealtime();
        try{
            ui(()->{try{Method m=MainActivity.class.getDeclaredMethod("selectPage",int.class);m.setAccessible(true);m.invoke(activity,1);}catch(Exception e){throw new AssertionError(e);}
                ((EditText)field(activity,"addonSource")).setText(source);Button inspect=(Button)find(activity.getWindow().getDecorView(),v->v instanceof Button&&"追加する内容を確認".contentEquals(((Button)v).getText()));assertNotNull(inspect);inspect.performClick();});
            consentThenClick("追加する","配布元・版",100_000);
            JSONObject d=null,row=null;long end=SystemClock.elapsedRealtime()+10_000;
            do{JSONArray addons=new JSONObject(b.skyAddons()).getJSONArray("addons");for(int i=0;i<addons.length();i++){JSONObject x=addons.getJSONObject(i);if(x.getJSONObject("definition").optString("source").contains(repo+"/resolve/")){row=x;d=x.getJSONObject("definition");break;}}if(d==null)SystemClock.sleep(200);}while(d==null&&SystemClock.elapsedRealtime()<end);
            assertNotNull("owner-admitted dynamic model",d);String id=d.getString("id");assertTrue(id.startsWith("sky.model."));
            assertEquals("",d.getJSONObject("entry").getJSONObject("profile").getString("manifestSignatureBase64Url"));save("model-admission.json",row.toString());
            ui(()->call(activity,"preparePublicModelInstall",id));consentThenClick("取得を始める","ライセンスと容量",20_000);
            JSONObject state=null;end=SystemClock.elapsedRealtime()+900_000;
            do{state=new JSONObject(b.publicModelInstallStatus());if(id.equals(state.optString("profileId"))&&"downloaded".equals(state.optString("status")))break;
                assertFalse(state.toString(),"failed".equals(state.optString("status")));SystemClock.sleep(1000);}while(SystemClock.elapsedRealtime()<end);
            assertEquals(state.toString(),id,state.getString("profileId"));assertEquals(state.toString(),"downloaded",state.getString("status"));assertFalse("first test requires actual network acquisition",state.getBoolean("cachedSource"));
            ui(()->{try{Method m=MainActivity.class.getDeclaredMethod("refreshModelDownload");m.setAccessible(true);m.invoke(activity);}catch(Exception e){throw new AssertionError(e);}});
            Button finish=waitButton("検証してPixelへ導入",15_000);ui(finish::performClick);end=SystemClock.elapsedRealtime()+300_000;
            do{state=new JSONObject(b.publicModelInstallStatus());if("installed".equals(state.optString("status")))break;SystemClock.sleep(1000);}while(SystemClock.elapsedRealtime()<end);
            assertEquals(state.toString(),"installed",state.getString("status"));save("model-install.json",state.toString());
            String request=InstrumentationRegistry.getArguments().getString("rockModelRequest","Summarize this text in English: Sky connects models and agents. Zema saves work and results.");
            JSONObject choice=new JSONObject(b.prepareLocalModelChoice(id,request));assertEquals(choice.toString(),"prepared",choice.getString("status"));assertEquals(id,choice.getString("profileId"));
            JSONObject submitted=new JSONObject(b.submitZemaSelected(UUID.randomUUID().toString(),null,request,"[]",choice.getString("manifestDigest"),true));assertEquals(submitted.toString(),"queued",submitted.getString("status"));
            String workId=submitted.getString("workId");JSONObject w=awaitReview(b,workId,start);String artifact=b.result(workId);assertTrue(artifact.length()>20);assertFalse(artifact.contains("<think>"));
            save("model-artifact.md",artifact);save("model-receipt.json",new JSONObject().put("work",w).put("choice",choice).put("modelDefinition",d).put("artifactSha256",sha(artifact)).put("elapsedMs",SystemClock.elapsedRealtime()-start).put("physicalInference",true).put("codeExecuted",false).toString());
        }finally{ui(activity::finish);}
    }
    static String sha(String s)throws Exception{return devHash(s.getBytes(StandardCharsets.UTF_8));}
    static String devHash(byte[] b)throws Exception{byte[] h=java.security.MessageDigest.getInstance("SHA-256").digest(b);StringBuilder x=new StringBuilder();for(byte v:h)x.append(String.format(Locale.ROOT,"%02x",v&255));return x.toString();}
    @Test public void addNonBundledAgentThenGenerateIdempotentlyAndRevoke()throws Exception{
        physical();ShellConnection b=new ShellConnection(c());String source=InstrumentationRegistry.getArguments().getString("rockAgentDefinitionUrl");assertNotNull(source);
        JSONObject proposal=new JSONObject(b.inspectSkyAddon(source));assertEquals(proposal.toString(),"prepared",proposal.getString("status"));String digest=proposal.getString("digest");
        assertEquals("blocked",new JSONObject(b.addSkyAddon(proposal.getString("proposalId"),"0".repeat(64),true)).getString("status"));
        assertEquals("blocked",new JSONObject(b.addSkyAddon(proposal.getString("proposalId"),digest,false)).getString("status"));
        JSONObject added=new JSONObject(b.addSkyAddon(proposal.getString("proposalId"),digest,true));assertEquals(added.toString(),"added",added.getString("status"));
        String request=InstrumentationRegistry.getArguments().getString("rockAgentRequest","Sky connects models and agents. Zema saves work and results. Summarize in one short English sentence.");
        JSONObject choice=new JSONObject(b.prepareSkyAgent(digest,"auto",request));assertEquals(choice.toString(),"prepared",choice.getString("status"));
        String resume=InstrumentationRegistry.getArguments().getString("rockResumeAgentWork");String requestId=InstrumentationRegistry.getArguments().getString("rockResumeAgentRequestId",UUID.randomUUID().toString());long start=SystemClock.elapsedRealtime();
        JSONObject sent=new JSONObject(b.submitSkyAgent(digest,requestId,request,choice.getString("manifestDigest"),true));assertEquals(sent.toString(),"queued",sent.getString("status"));String id=sent.getString("workId");
        if(resume!=null){assertEquals(resume,id);JSONObject held=work(b,id);assertEquals("LOCAL_REQUEST_REPLAN_REQUIRED",held.getJSONArray("runs").getJSONObject(0).getString("error"));b.retry(id);}
        JSONObject w=awaitReview(b,id,start);String artifact=b.result(id);assertTrue(artifact.length()>20);
        JSONObject retry=new JSONObject(b.submitSkyAgent(digest,requestId,request,choice.getString("manifestDigest"),true));assertEquals(id,retry.getString("workId"));assertEquals(artifact,b.result(id));
        save("agent-artifact.md",artifact);save("agent-receipt.json",new JSONObject().put("proposal",proposal).put("choice",choice).put("work",w).put("sameRequestIdReturnedSameWork",true).put("artifactSha256",sha(artifact)).put("physicalInference",true).put("elapsedMs",SystemClock.elapsedRealtime()-start).toString());
        assertEquals("revoked",new JSONObject(b.revokeSkyAddon(digest,true)).getString("status"));assertEquals("blocked",new JSONObject(b.prepareSkyAgent(digest,"auto",request)).getString("status"));assertEquals(artifact,b.result(id));
        JSONObject fresh=new JSONObject(b.inspectSkyAddon(source));assertEquals("added",new JSONObject(b.addSkyAddon(fresh.getString("proposalId"),fresh.getString("digest"),true)).getString("status"));
        assertEquals("prepared",new JSONObject(b.prepareSkyAgent(digest,"auto",request)).getString("status"));
        save("agent-revocation.json",new JSONObject().put("newUseBlocked",true).put("savedArtifactPreserved",true).put("digest",digest).toString());
    }
    @Test public void currentNonBundledCodeAndTaskSpecificAutomaticAdmission()throws Exception {
        physical();ShellConnection b=new ShellConnection(c());JSONArray rows=new JSONObject(b.skyAddons()).getJSONArray("addons");JSONObject row=null;
        for(int i=0;i<rows.length();i++)if("model".equals(rows.getJSONObject(i).getJSONObject("definition").getString("kind")))row=rows.getJSONObject(i);
        assertNotNull(row);String id=row.getJSONObject("definition").getString("id"),digest=row.getString("digest");
        JSONObject refusal=new JSONObject(b.configureSkyModelAutomaticTasks(digest,row.optLong("automaticRevision",0),"[\"summary\"]",true));assertEquals("MODEL_TASK_TRIAL_REQUIRED",refusal.getString("code"));
        String request="Python function sum_even(numbers): return the sum of even integers. Code only, no example usage.";
        JSONObject choice=new JSONObject(b.prepareLocalModelChoice(id,request));assertEquals(choice.toString(),"prepared",choice.getString("status"));
        long start=SystemClock.elapsedRealtime();JSONObject sent=new JSONObject(b.submitZemaSelected(UUID.randomUUID().toString(),null,request,"[]",choice.getString("manifestDigest"),true));assertEquals(sent.toString(),"queued",sent.getString("status"));
        JSONObject w=awaitReview(b,sent.getString("workId"),start);String artifact=b.result(w.getString("id"));assertTrue(artifact.contains("sum_even"));assertTrue(artifact.contains("return"));
        assertEquals("configured",new JSONObject(b.configureSkyModelAutomaticTasks(digest,row.optLong("automaticRevision",0),"[\"code\"]",true)).getString("status"));
        JSONArray catalog=new JSONObject(b.localModelCatalog()).getJSONArray("models");JSONObject added=null;
        for(int i=0;i<catalog.length();i++)if(id.equals(catalog.getJSONObject(i).getString("profileId")))added=catalog.getJSONObject(i);
        assertNotNull(added);assertEquals(60,added.getInt("autoPriority"));assertEquals("code",added.getJSONArray("tasks").getString(0));
        JSONObject automatic=new JSONObject(b.prepareLocalModelChoice("auto",request));assertEquals("dev.rock.qwen25-coder-15b-q4km",automatic.getString("profileId"));
        save("current-code-artifact.md",artifact);save("current-code-receipt.json",new JSONObject().put("work",w).put("manualChoice",choice).put("automaticChoice",automatic).put("dynamicCandidate",added)
            .put("untestedSummaryAutoRejected",true).put("artifactSha256",sha(artifact)).put("physicalInference",true).put("codeExecuted",false).put("elapsedMs",SystemClock.elapsedRealtime()-start).toString());
    }
    @Test public void explicitlyStopOnlyFailedSyntheticCodeProbe()throws Exception {
        String expected=InstrumentationRegistry.getArguments().getString("rockCleanupProbeId");assertNotNull(expected);
        JSONObject progress=new JSONObject(new String(Files.readAllBytes(new File(c().getExternalFilesDir(null),"open-addon-work-progress.json").toPath()),StandardCharsets.UTF_8));
        assertEquals(expected,progress.getString("id"));ShellConnection b=new ShellConnection(c());JSONObject current=work(b,expected);
        assertEquals("needs_review",current.getJSONArray("runs").getJSONObject(0).getString("state"));
        assertEquals("LOCAL_DRAFT_TASK_CHANGED",current.getJSONArray("runs").getJSONObject(0).getString("error"));
        assertTrue(current.getJSONObject("planner").getString("profileId").startsWith("sky.model."));
        save("failed-code-probe.json",current.toString());b.cancel(expected);assertEquals("cancelled",work(b,expected).getString("state"));
    }
    @Test public void savedAddonsAndArtifactsReopenWithoutSubmission()throws Exception {
        ShellConnection b=new ShellConnection(c());int before=new JSONObject(b.snapshot()).getInt("totalWorkCount");
        MainActivity a=trialActivity;
        ui(()->{try{Method m=MainActivity.class.getDeclaredMethod("selectPage",int.class);m.setAccessible(true);m.invoke(a,1);}catch(Exception e){throw new AssertionError(e);}});
        Button use=waitButton("このAgentに依頼",20_000);ui(use::performClick);
        Button prepare=waitButton("モデルと実行条件を確認",5_000);
        ui(()->{for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews()){
            if(find(root,v->v instanceof TextView&&"このAgentへの依頼".contentEquals(((TextView)v).getText()))!=null){
                EditText input=(EditText)find(root,v->v instanceof EditText);assertNotNull(input);input.setText("SkyとZemaの役割を短くまとめてください。");}}prepare.performClick();});
        Button start=waitButton("開始する",20_000);ui(()->{assertFalse(start.isEnabled());
            boolean model=false,consent=false;for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews()){
                model|=find(root,v->v instanceof TextView&&((TextView)v).getText().toString().contains("モデル: "))!=null;
                CheckBox check=(CheckBox)find(root,v->v instanceof CheckBox&&((CheckBox)v).getText().toString().startsWith("このAgent設定と依頼"));
                if(check!=null){consent=true;assertFalse(check.isChecked());}}
            assertTrue(model);assertTrue(consent);});
        Button back=waitButton("戻る",1000);ui(back::performClick);
        JSONArray receipts=new JSONArray();
        for(String name:new String[]{"agent-receipt.json","current-code-receipt.json"}){
            JSONObject receipt=new JSONObject(new String(Files.readAllBytes(new File(c().getExternalFilesDir(null),"open-addon-"+name).toPath()),StandardCharsets.UTF_8));
            String id=receipt.getJSONObject("work").getString("id"),artifact=b.result(id);assertEquals(receipt.getString("artifactSha256"),sha(artifact));
            JSONObject w=work(b,id);assertEquals("review",w.getString("state"));
            ui(()->call(a,"openWork",id));long end=SystemClock.elapsedRealtime()+15_000;AtomicReference<View> body=new AtomicReference<>();
            do{ui(()->body.set(find((View)field(a,"jobs"),v->v instanceof TextView&&artifact.contentEquals(((TextView)v).getText()))));if(body.get()==null)SystemClock.sleep(200);}while(body.get()==null&&SystemClock.elapsedRealtime()<end);
            assertNotNull("actual saved artifact rendered in work detail",body.get());
            if(name.startsWith("agent"))ui(()->assertNotNull(find((View)field(a,"jobs"),v->v instanceof TextView&&((TextView)v).getText().toString().startsWith("Agent: "))));
            receipts.put(new JSONObject().put("workId",id).put("artifactSha256",sha(artifact)).put("actualUiRendered",true));
        }
        assertEquals(before,new JSONObject(b.snapshot()).getInt("totalWorkCount"));
        try(FileOutputStream out=new FileOutputStream(new File(c().getExternalFilesDir(null),"open-addon-readback-ui.png"))){ins.getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
        save("readback-ui.json",new JSONObject().put("artifacts",receipts).put("agentStartConsentUnchecked",true).put("modelShownBeforeExecution",true).put("newWorkCreated",false).toString());
    }

    @Test public void admittedAgentRunsRealToolsAfterExplicitUiConsentAndSavesTheTransformedArtifact()throws Exception {
        Assume.assumeTrue("explicit real Tool Agent trial","true".equals(InstrumentationRegistry.getArguments().getString("rockAgentToolsPhysical")));
        ShellConnection b=new ShellConnection(c());String source=InstrumentationRegistry.getArguments().getString("rockAgentToolDefinitionUrl");assertNotNull(source);
        MainActivity a=trialActivity;int before=new JSONObject(b.snapshot()).getInt("totalWorkCount");
        ui(()->{try{Method m=MainActivity.class.getDeclaredMethod("selectPage",int.class);m.setAccessible(true);m.invoke(a,1);}catch(Exception e){throw new AssertionError(e);}
            ((EditText)field(a,"addonSource")).setText(source);Button inspect=(Button)find(a.getWindow().getDecorView(),v->v instanceof Button&&"追加する内容を確認".contentEquals(((Button)v).getText()));inspect.performClick();});
        consentThenClick("追加する","配布元・版",100_000);
        JSONObject row=null;long end=SystemClock.elapsedRealtime()+10_000;
        do{JSONArray rows=new JSONObject(b.skyAddons()).getJSONArray("addons");for(int n=0;n<rows.length();n++)if("Toolで文書を仕上げるAgent".equals(rows.getJSONObject(n).getJSONObject("definition").getString("name")))row=rows.getJSONObject(n);if(row==null)SystemClock.sleep(200);}while(row==null&&SystemClock.elapsedRealtime()<end);
        assertNotNull(row);String digest=row.getString("digest");assertEquals(before,new JSONObject(b.snapshot()).getInt("totalWorkCount"));
        String request="SkyとZemaの使い分けを説明する短い日本語の下書きを作って。Skyはモデル・Agent・Toolを接続し、Zemaは仕事の進捗と成果を保存します。";
        JSONObject prepared=new JSONObject(b.prepareSkyAgent(digest,"auto",request));assertEquals(prepared.toString(),"prepared",prepared.getString("status"));
        assertEquals("local-tools/1",prepared.getString("agentRunner"));assertEquals("citations@1",prepared.getJSONArray("tools").getString(0));assertEquals("free-article@1",prepared.getJSONArray("tools").getString(1));
        AtomicReference<Button> use=new AtomicReference<>();end=SystemClock.elapsedRealtime()+10_000;
        do{ui(()->{View label=find((View)field(a,"addonList"),v->v instanceof TextView&&"Toolで文書を仕上げるAgent".contentEquals(((TextView)v).getText()));
            if(label!=null)use.set((Button)find((View)label.getParent(),v->v instanceof Button&&"このAgentに依頼".contentEquals(((Button)v).getText())));});if(use.get()==null)SystemClock.sleep(200);}while(use.get()==null&&SystemClock.elapsedRealtime()<end);
        assertNotNull(use.get());ui(()->use.get().performClick());Button confirm=waitButton("モデルと実行条件を確認",5000);
        ui(()->{for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews())if(find(root,v->v instanceof TextView&&"このAgentへの依頼".contentEquals(((TextView)v).getText()))!=null){((EditText)find(root,v->v instanceof EditText)).setText(request);}confirm.performClick();});
        Button start=waitButton("開始する",20_000);AtomicReference<String> requestId=new AtomicReference<>();
        assertEquals(before,new JSONObject(b.snapshot()).getInt("totalWorkCount"));
        ui(()->{assertFalse(start.isEnabled());boolean checked=false;for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews()){
            TextView details=(TextView)find(root,v->v instanceof TextView&&((TextView)v).getText().toString().contains("実行するTool（順番）"));
            if(details!=null){assertTrue(details.getText().toString().contains("citations@1"));assertTrue(details.getText().toString().contains("free-article@1"));assertTrue(details.getText().toString().contains(prepared.optString("name")));}
            CheckBox check=(CheckBox)find(root,v->v instanceof CheckBox&&((CheckBox)v).getText().toString().contains("表示したTool"));
            if(check!=null){assertFalse(check.isChecked());check.setChecked(true);checked=true;}}
            assertTrue(checked);assertTrue(start.isEnabled());start.performClick();start.performClick();
            try{Field active=LocalSubmission.class.getDeclaredField("active");active.setAccessible(true);LocalSubmission.Attempt attempt=(LocalSubmission.Attempt)active.get(field(a,"agentSubmission"));assertNotNull(attempt);requestId.set(attempt.requestId);}catch(Exception e){throw new AssertionError(e);}
        });
        AtomicReference<String> id=new AtomicReference<>();end=SystemClock.elapsedRealtime()+20_000;
        do{ui(()->id.set((String)field(a,"focusedWorkId")));if(id.get()==null)SystemClock.sleep(200);}while(id.get()==null&&SystemClock.elapsedRealtime()<end);assertNotNull(id.get());
        save("agent-tools-start.json",new JSONObject().put("workId",id.get()).put("requestId",requestId.get()).put("definition",row).toString());
        long began=SystemClock.elapsedRealtime();JSONObject work=awaitReview(b,id.get(),began);String artifact=b.result(id.get());
        String[] operations={"local-generate@1","agent-tool-input@1","citations@1","free-article@1","agent-tool-seal@1"};assertEquals(5,work.getJSONArray("runs").length());
        for(int n=0;n<operations.length;n++){assertEquals(operations[n],work.getJSONArray("runs").getJSONObject(n).getString("tool"));assertEquals(1,work.getJSONArray("runs").getJSONObject(n).getInt("attempt"));}
        assertTrue(artifact.contains("この記事は無料版です。"));assertTrue(artifact.contains("citations@1 → free-article@1"));assertTrue(artifact.contains("Sky"));
        assertEquals(before+1,new JSONObject(b.snapshot()).getInt("totalWorkCount"));
        JSONObject replay=new JSONObject(b.submitSkyAgent(digest,requestId.get(),request,prepared.getString("manifestDigest"),true));assertEquals(id.get(),replay.getString("workId"));assertEquals(artifact,b.result(id.get()));
        save("agent-tools-artifact.md",artifact);save("agent-tools-receipt.json",new JSONObject().put("work",work).put("definition",row).put("choice",prepared).put("artifactSha256",sha(artifact)).put("actualUiConsentAndDoubleTapOneWork",true)
            .put("sameRequestIdSameWork",true).put("physicalInferenceAndToolBinder",true).put("elapsedAfterQueueMs",SystemClock.elapsedRealtime()-began).put("codeExecuted",false).put("publishedOrCharged",false).toString());
        assertEquals("revoked",new JSONObject(b.revokeSkyAddon(digest,true)).getString("status"));assertEquals("blocked",new JSONObject(b.prepareSkyAgent(digest,"auto",request)).getString("status"));assertEquals(artifact,b.result(id.get()));
        JSONObject fresh=new JSONObject(b.inspectSkyAddon(source));assertEquals("added",new JSONObject(b.addSkyAddon(fresh.getString("proposalId"),fresh.getString("digest"),true)).getString("status"));
    }
    @Test public void toolAgentSavedResultReopensAfterBrokerRestartWithoutAnotherToolRun()throws Exception {
        Assume.assumeTrue("explicit readback","true".equals(InstrumentationRegistry.getArguments().getString("rockAgentToolsPhysical")));
        JSONObject receipt=new JSONObject(new String(Files.readAllBytes(new File(c().getExternalFilesDir(null),"open-addon-agent-tools-receipt.json").toPath()),StandardCharsets.UTF_8));
        ShellConnection b=new ShellConnection(c());String id=receipt.getJSONObject("work").getString("id"),artifact=b.result(id);int before=new JSONObject(b.snapshot()).getInt("totalWorkCount");
        assertEquals(receipt.getString("artifactSha256"),sha(artifact));JSONObject work=work(b,id);assertEquals("review",work.getString("state"));
        assertEquals(receipt.getJSONObject("work").getJSONArray("runs").toString(),work.getJSONArray("runs").toString());
        ui(()->call(trialActivity,"openWork",id));AtomicReference<View> body=new AtomicReference<>();long end=SystemClock.elapsedRealtime()+10_000;
        do{ui(()->body.set(find((View)field(trialActivity,"jobs"),v->v instanceof TextView&&artifact.contentEquals(((TextView)v).getText()))));if(body.get()==null)SystemClock.sleep(200);}while(body.get()==null&&SystemClock.elapsedRealtime()<end);assertNotNull(body.get());
        ui(()->assertNotNull(find((View)field(trialActivity,"jobs"),v->v instanceof TextView&&((TextView)v).getText().toString().contains("使用Tool: "))));
        assertEquals(before,new JSONObject(b.snapshot()).getInt("totalWorkCount"));
        try(FileOutputStream out=new FileOutputStream(new File(c().getExternalFilesDir(null),"open-addon-agent-tools-readback.png"))){ins.getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
        save("agent-tools-readback.json",new JSONObject().put("workId",id).put("artifactSha256",sha(artifact)).put("sameRunAttempts",true).put("actualWorkUi",true).put("newWorkCreated",false).toString());
    }

    @Test public void stopOnlyTheFailedSyntheticToolAgentBeforeChangingItsModel()throws Exception {
        Assume.assumeTrue("explicit failed synthetic Tool Agent cleanup","true".equals(InstrumentationRegistry.getArguments().getString("rockAgentToolsPhysical")));
        JSONObject receipt=new JSONObject(new String(Files.readAllBytes(new File(c().getExternalFilesDir(null),"open-addon-agent-tools-start.json").toPath()),StandardCharsets.UTF_8));
        ShellConnection b=new ShellConnection(c());String id=receipt.getString("workId");JSONObject work=work(b,id);
        assertEquals("AGENT_TOOL_INPUT_INVALID",work.getJSONArray("runs").getJSONObject(1).getString("error"));
        assertEquals("agent-tool-input@1",work.getJSONArray("runs").getJSONObject(1).getString("tool"));
        assertEquals("local-tools/1",work.getJSONObject("agent").getString("runner"));
        for(int n=2;n<work.getJSONArray("runs").length();n++)assertEquals(0,work.getJSONArray("runs").getJSONObject(n).getInt("attempt"));
        save("agent-tools-failed-first.json",work.toString());b.cancel(id);assertEquals("cancelled",work(b,id).getString("state"));
    }

}
