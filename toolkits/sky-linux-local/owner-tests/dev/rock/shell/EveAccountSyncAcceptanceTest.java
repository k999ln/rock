package dev.rock.shell;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

/** Explicit owner-run acceptance only. Never enrolls biometrics or approves an account grant. */
@RunWith(AndroidJUnit4.class)
public class EveAccountSyncAcceptanceTest {
    private final Instrumentation ins=InstrumentationRegistry.getInstrumentation();
    private final Context c=ins.getTargetContext();
    private final JSONObject receipt=new JSONObject();
    private JSONObject status() throws Exception { return SkyLinuxBridge.request(c,new JSONObject().put("action","status")); }
    private void record(String key,Object value) throws Exception {
        receipt.put(key,value);
        try(FileOutputStream f=c.openFileOutput("eve-account-acceptance.json",Context.MODE_PRIVATE)){f.write(receipt.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
    private void ui(Runnable run){ins.runOnMainSync(run);ins.waitForIdleSync();}
    private View root(){for(Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a.getPackageName().equals(c.getPackageName()))return a.getWindow().getDecorView();return null;}
    private View find(View v,String text,String tag){if(v==null||!v.isShown())return null;if(tag!=null&&tag.equals(v.getTag()))return v;if(text!=null&&v instanceof TextView&&text.equals(((TextView)v).getText().toString()))return v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=find(((ViewGroup)v).getChildAt(i),text,tag);if(found!=null)return found;}return null;}
    private void click(String text){long end=SystemClock.elapsedRealtime()+20000;while(SystemClock.elapsedRealtime()<end){boolean[] ok={false};ui(()->{View v=null;for(View window:android.view.inspector.WindowInspector.getGlobalWindowViews()){v=find(window,text,null);if(v!=null)break;}if(v!=null&&v.isEnabled()){v.performClick();ok[0]=true;}});if(ok[0])return;SystemClock.sleep(250);}fail("Missing control: "+text);}
    private void unlocked() throws Exception {boolean locked=((KeyguardManager)c.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceLocked();record("deviceLocked",locked);assertFalse("Owner unlock required",locked);}
    private void saveBaseline(JSONObject s)throws Exception {try(FileOutputStream f=c.openFileOutput("eve-account-before.json",Context.MODE_PRIVATE)){f.write(s.toString().getBytes(StandardCharsets.UTF_8));}}
    @Test public void pairedAccountPreflight()throws Exception {unlocked();JSONObject s=status();saveBaseline(s);record("phase",s.getString("phase"));int active=0;for(int i=0;i<s.getJSONArray("runs").length();i++)if("active".equals(s.getJSONArray("runs").getJSONObject(i).getJSONObject("job").getString("status")))active++;record("activeJobs",active);record("jobs",s.getJSONArray("runs").length());record("models",s.getJSONArray("models").length());record("agents",s.getJSONArray("agents").length());record("conversationContextVersion",s.optInt("conversationContextVersion"));assertEquals(1,s.optInt("conversationContextVersion"));record("preflightPassed",true);String exportId=InstrumentationRegistry.getArguments().getString("exportJobId","");if(!exportId.isEmpty()){JSONObject exported=SkyLinuxBridge.request(c,new JSONObject().put("action","export").put("jobId",exportId));String text=exported.getString("text");assertTrue(text.contains("0円（端末内で推論）"));assertFalse(text.contains("クラウドへ送っていません"));record("exportFooterAccurate",true);}}
    @Test public void beginAndAwaitOwnerApproval()throws Exception {
        unlocked();JSONObject s=status();assertEquals(1,s.optInt("conversationContextVersion"));
        c.startActivity(new Intent(c,EveAccountActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(750);
        if(!EveAccountSync.linked(c)){
            JSONObject pending=EveAccountSync.begin(c,EveAccountSync.endpoint(c));String code=pending.getString("userCode");
            assertTrue("Account code was not returned",code.matches("[A-HJ-NP-Z2-9]{8}"));
            Bundle progress=new Bundle();progress.putString("stream","EVE_ACCOUNT_APPROVAL_URL=https://avoado.si/account?returnTo=%2Fconnect%2Fdevice%3Fuser_code%3D"+code+"\n");ins.sendStatus(1,progress);
            long end=SystemClock.elapsedRealtime()+600000;
            while(!EveAccountSync.linked(c)&&SystemClock.elapsedRealtime()<end){SystemClock.sleep(5100);EveAccountSync.poll(c);}
        }
        assertTrue("Owner approval not completed",EveAccountSync.linked(c));record("nativeSessionStored",true);record("origin",EveAccountSync.endpoint(c));EveAccountSync.sync(c,status());record("initialSyncPassed",true);
    }
    @Test public void prepareCachedModelAndWaitForWebJob()throws Exception {
        unlocked();assertTrue(EveAccountSync.linked(c));String model=InstrumentationRegistry.getArguments().getString("modelId","");assertEquals("hf-74a4da8c9fdbcd15bd1f6d01-chatml",model);
        JSONObject before=status();saveBaseline(before);Set<String> ids=new HashSet<>();for(int i=0;i<before.getJSONArray("runs").length();i++)ids.add(before.getJSONArray("runs").getJSONObject(i).getJSONObject("job").getString("id"));
        SkyLinuxBridge.request(c,new JSONObject().put("action","prepare").put("accepted",true).put("modelId",model));long end=SystemClock.elapsedRealtime()+60000;JSONObject s=status();while(!"ready".equals(s.optString("phase"))&&SystemClock.elapsedRealtime()<end){SystemClock.sleep(500);s=status();}assertEquals("ready",s.getString("phase"));
        Bundle progress=new Bundle();progress.putString("stream","EVE_PIXEL_READY_FOR_EXPLICIT_WEB_REQUEST\n");ins.sendStatus(1,progress);end=SystemClock.elapsedRealtime()+300000;JSONObject created=null;
        while(SystemClock.elapsedRealtime()<end){s=status();EveAccountSync.sync(c,s);JSONArray runs=s.getJSONArray("runs");assertTrue(runs.length()<=ids.size()+1);for(int i=0;i<runs.length();i++){JSONObject r=runs.getJSONObject(i);if(!ids.contains(r.getJSONObject("job").getString("id"))){assertTrue(r.getString("input").startsWith("[RockstarOS 同期試験]"));created=r;}}if(created!=null&&"review".equals(created.getJSONObject("job").getString("status")))break;SystemClock.sleep(2500);}
        assertNotNull("No explicit Web request received",created);assertEquals("review",created.getJSONObject("job").getString("status"));EveAccountSync.sync(c,status());record("webJobId",created.getJSONObject("job").getString("id"));record("threadId",created.getString("threadId"));record("webJobOutput",created.getString("text"));record("jobsBefore",ids.size());record("webJobSynced",true);
    }
    @Test public void continueSameThreadFromNativeUi()throws Exception {
        unlocked();assertTrue(EveAccountSync.linked(c));String thread=InstrumentationRegistry.getArguments().getString("threadId","");assertTrue(thread.matches("[0-9a-f-]{36}"));
        JSONObject before=status();saveBaseline(before);Set<String> old=new HashSet<>();JSONArray aa=before.getJSONArray("runs");for(int i=0;i<aa.length();i++)old.add(aa.getJSONObject(i).getJSONObject("job").getString("id"));
        JSONObject remote=EveAccountSync.request(c,"/api/eve/history?id="+thread,"GET",null,true);String title=remote.getJSONObject("session").getJSONArray("messages").getJSONObject(0).getString("text");
        c.startActivity(new Intent(c,EveAccountActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));click(title.substring(0,Math.min(60,title.length())));click("この会話をEveで続ける");
        long end=SystemClock.elapsedRealtime()+30000;boolean[] selected={false};while(!selected[0]&&SystemClock.elapsedRealtime()<end){ui(()->{View v=find(root(),null,"pixel-sky-agents");if(v instanceof Spinner){Spinner sp=(Spinner)v;for(int i=0;i<sp.getCount();i++)if(sp.getItemAtPosition(i).toString().contains("AI担当を考える係")){sp.setSelection(i);selected[0]=true;break;}}});SystemClock.sleep(300);}assertTrue(selected[0]);
        ui(()->{((EditText)find(root(),null,"pixel-sky-request")).setText("[RockstarOS 同期試験] Continue the previous answer with one short final checklist.");});
        boolean[] sent={false},preparing={false};end=SystemClock.elapsedRealtime()+60000;
        while(!sent[0]&&SystemClock.elapsedRealtime()<end){ui(()->{View r=root(),v=find(r,null,"pixel-sky-run");if(!(v instanceof Button)||!v.isEnabled())return;String name=((Button)v).getText().toString();if(name.contains("準備する")&&!preparing[0]){preparing[0]=true;v.performClick();return;}if("この担当に依頼する".equals(name)){checkConsent(r);v.performClick();sent[0]=true;}});SystemClock.sleep(500);}assertTrue("Native request control unavailable",sent[0]);
        JSONObject created=null;end=SystemClock.elapsedRealtime()+120000;
        while(SystemClock.elapsedRealtime()<end){JSONObject snapshot=status();JSONArray runs=snapshot.getJSONArray("runs");assertTrue(runs.length()<=old.size()+1);for(int i=0;i<runs.length();i++)if(!old.contains(runs.getJSONObject(i).getJSONObject("job").getString("id")))created=runs.getJSONObject(i);if(created!=null&&"review".equals(created.getJSONObject("job").getString("status")))break;SystemClock.sleep(2000);}
        assertNotNull(created);assertEquals("review",created.getJSONObject("job").getString("status"));assertEquals(thread,created.getString("threadId"));assertTrue(created.getString("contextSha256").matches("[a-f0-9]{64}"));EveAccountSync.sync(c,status());JSONObject after=EveAccountSync.request(c,"/api/eve/history?id="+thread,"GET",null,true);assertEquals(4,after.getJSONObject("session").getJSONArray("messages").length());record("nativeJobId",created.getJSONObject("job").getString("id"));record("threadId",thread);record("contextSha256",created.getString("contextSha256"));record("nativeOutput",created.getString("text"));record("jobsBefore",old.size());record("sameThreadMessages",4);record("nativeContinuationSynced",true);
    }
    private void checkConsent(View view){if(view instanceof CheckBox&&((CheckBox)view).getText().toString().startsWith("料金と実行先"))((CheckBox)view).setChecked(true);if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)checkConsent(((ViewGroup)view).getChildAt(i));}

}
