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
        physical();ShellConnection b=new ShellConnection(c());String repo="bartowski/Qwen2.5-0.5B-Instruct-GGUF";
        JSONObject search=new JSONObject(b.searchPublicModels("Qwen2.5-0.5B-Instruct-GGUF"));boolean found=false;
        JSONArray candidates=search.getJSONArray("candidates");for(int i=0;i<candidates.length();i++)found|=repo.equals(candidates.getJSONObject(i).optString("id"));assertTrue("actual public search must find selected repo",found);
        save("live-search.json",search.toString());String source="https://huggingface.co/"+repo+"/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf";
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
            String request="Summarize this text in English: Sky connects models and agents. Zema saves work and results.";
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
        String request="Sky connects models and agents. Zema saves work and results. Summarize in one short English sentence.";
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
}
