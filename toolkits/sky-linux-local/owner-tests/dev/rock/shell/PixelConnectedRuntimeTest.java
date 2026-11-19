package dev.rock.shell;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.After;
import org.junit.runner.RunWith;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Explicit owner-run physical suite only. Not part of default CI or a public package. */
@RunWith(AndroidJUnit4.class)
public class PixelConnectedRuntimeTest {
    private final Instrumentation ins=InstrumentationRegistry.getInstrumentation();
    private final Context context=ins.getTargetContext();
    private Activity activity;
    private final JSONObject receipt=new JSONObject();
    private final java.util.List<String> temporaryExports=new java.util.ArrayList<>();
    private String temporaryExport(String extension){String name="Sky-check-"+java.util.UUID.randomUUID()+"."+extension;temporaryExports.add(name);return name;}
    @After public void collectTemporaryExports()throws Exception{
        for(String name:temporaryExports){
            assertTrue(name.matches("Sky-check-[0-9a-f-]{36}\\.(txt|json)"));
            try(ParcelFileDescriptor command=ins.getUiAutomation().executeShellCommand("rm -f -- /sdcard/Download/"+name)){
                try(InputStream done=new ParcelFileDescriptor.AutoCloseInputStream(command)){while(done.read()!=-1){}}
            }
        }
        JSONObject result=new JSONObject().put("temporaryExportCount",temporaryExports.size()).put("collected",true).put("ownerExportsTouched",false);
        try(FileOutputStream out=context.openFileOutput("pixel-temporary-export-cleanup.json",Context.MODE_PRIVATE)){out.write(result.toString(2).getBytes(StandardCharsets.UTF_8));}
    }

    private void ui(Runnable f){ins.runOnMainSync(f);ins.waitForIdleSync();}
    private View root(){for(Activity a:androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED))if(a.getClass().getName().equals("dev.rock.shell.SkyLinuxActivity"))activity=a;return activity.getWindow().getDecorView();}
    private View find(View v,String text,String tag){if(!v.isShown())return null;if(tag!=null&&tag.equals(v.getTag()))return v;if(text!=null&&v instanceof TextView&&text.equals(((TextView)v).getText().toString()))return v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View n=find(((ViewGroup)v).getChildAt(i),text,tag);if(n!=null)return n;}return null;}
    private void click(String text){long end=SystemClock.elapsedRealtime()+25000;while(SystemClock.elapsedRealtime()<end){boolean[] ready={false};ui(()->{View v=find(root(),text,null);ready[0]=v!=null&&v.isEnabled()&&v.isShown()&&find(root(),"操作しています…",null)==null;});if(ready[0]){ui(()->{View v=find(root(),text,null);v.requestRectangleOnScreen(new android.graphics.Rect(0,0,v.getWidth(),v.getHeight()),true);assertTrue(v.performClick());});SystemClock.sleep(350);return;}SystemClock.sleep(200);}debugView("failedBeforeClick");fail("操作できません: "+text);}
    private JSONObject api(String value)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:5199/__sky/linux").openConnection();c.setRequestMethod("POST");c.setConnectTimeout(2000);c.setReadTimeout(15000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Origin","http://127.0.0.1:5199");try{c.getOutputStream().write(value.getBytes(StandardCharsets.UTF_8));assertEquals(200,c.getResponseCode());ByteArrayOutputStream b=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){byte[] p=new byte[8192];int n;while((n=in.read(p))!=-1){b.write(p,0,n);assertTrue(b.size()<5000000);}}return new JSONObject(b.toString("UTF-8"));}finally{c.disconnect();}}
    private JSONObject status()throws Exception{return api("{\"action\":\"status\"}");}
    private void record(String key,Object value)throws Exception{receipt.put(key,value);try(FileOutputStream out=context.openFileOutput("pixel-connected-receipt.json",Context.MODE_PRIVATE)){out.write(receipt.toString(2).getBytes(StandardCharsets.UTF_8));}}
    private AccessibilityNodeInfo external(String text){AccessibilityNodeInfo r=ins.getUiAutomation().getRootInActiveWindow();return external(r,text);}
    private AccessibilityNodeInfo external(AccessibilityNodeInfo n,String text){if(n==null)return null;String t=n.getText()==null?"":n.getText().toString(),d=n.getContentDescription()==null?"":n.getContentDescription().toString();if(text.equals(t)||text.equals(d))return n;for(int i=0;i<n.getChildCount();i++){AccessibilityNodeInfo f=external(n.getChild(i),text);if(f!=null)return f;}return null;}
    private AccessibilityNodeInfo edit(AccessibilityNodeInfo n){if(n==null)return null;if("android.widget.EditText".contentEquals(n.getClassName()))return n;for(int i=0;i<n.getChildCount();i++){AccessibilityNodeInfo f=edit(n.getChild(i));if(f!=null)return f;}return null;}
    private boolean externalClick(String text){AccessibilityNodeInfo n=external(text);while(n!=null){if(n.isClickable()&&n.isEnabled())return n.performAction(AccessibilityNodeInfo.ACTION_CLICK);n=n.getParent();}return false;}
    private void collect(AccessibilityNodeInfo n,JSONArray into)throws Exception{if(n==null||into.length()>100)return;if(n.getText()!=null)into.put(n.getText().toString().substring(0,Math.min(180,n.getText().length())));for(int i=0;i<n.getChildCount();i++)collect(n.getChild(i),into);}
    private void captureFailure(){try{JSONArray values=new JSONArray();collect(ins.getUiAutomation().getRootInActiveWindow(),values);try(FileOutputStream out=context.openFileOutput("pixel-ui-visible-failure.json",Context.MODE_PRIVATE)){out.write(values.toString(2).getBytes(StandardCharsets.UTF_8));}android.graphics.Bitmap b=ins.getUiAutomation().takeScreenshot();if(b!=null)try(FileOutputStream out=context.openFileOutput("pixel-ui-visible-failure.png",Context.MODE_PRIVATE)){b.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}}catch(Exception ignored){}}
    private void waitExternal(String text){long end=SystemClock.elapsedRealtime()+15000;while(SystemClock.elapsedRealtime()<end){if(externalClick(text))return;SystemClock.sleep(250);}captureFailure();fail("確認操作を待ちました: "+text);}
    private void openFile(String text)throws Exception{
        SystemClock.sleep(1800);
        long end=SystemClock.elapsedRealtime()+20000;boolean menu=false;
        while(SystemClock.elapsedRealtime()<end){
            AccessibilityNodeInfo current=ins.getUiAutomation().getRootInActiveWindow();
            if(current!=null)current.refresh();
            AccessibilityNodeInfo file=external(current,text);
            if(file!=null&&file.isVisibleToUser()){
                file.refresh();
                android.graphics.Rect bounds=new android.graphics.Rect();file.getBoundsInScreen(bounds);
                if(!bounds.isEmpty()){
                    try(ParcelFileDescriptor tap=ins.getUiAutomation().executeShellCommand("input tap "+bounds.centerX()+" "+bounds.centerY())){
                        try(InputStream done=new ParcelFileDescriptor.AutoCloseInputStream(tap)){while(done.read()!=-1){}}
                    }
                    long returned=SystemClock.elapsedRealtime()+2500;
                    while(SystemClock.elapsedRealtime()<returned){
                        AccessibilityNodeInfo next=ins.getUiAutomation().getRootInActiveWindow();
                        if(next!=null&&"dev.rock.shell".contentEquals(next.getPackageName()))return;
                        SystemClock.sleep(200);
                    }
                }
            }else if(!menu&&(externalClick("ルートを表示する")||externalClick("Show roots"))){
                SystemClock.sleep(500);externalClick("ダウンロード");externalClick("Downloads");menu=true;
            }
            SystemClock.sleep(400);
        }
        captureFailure();fail("設定ファイルを選択できません: "+text);
    }
    private void selectAgent(String modelId)throws Exception{JSONObject s=status();JSONArray list=s.getJSONArray("agents");int chosen=-1;for(int i=0;i<list.length();i++)if(modelId.equals(list.getJSONObject(i).getString("modelId")))chosen=i;assertTrue(chosen>=0);final int index=chosen;ui(()->((Spinner)find(root(),null,"pixel-sky-agents")).setSelection(index));SystemClock.sleep(1800);}
    private void input(String value){ui(()->{((EditText)find(root(),null,"pixel-sky-request")).setText(value);consent(root());});}
    private void consent(View v){if(v instanceof CheckBox&&((CheckBox)v).getText().toString().startsWith("料金と実行先"))((CheckBox)v).setChecked(true);if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)consent(((ViewGroup)v).getChildAt(i));}
    private JSONObject latestJob(String state,int seconds)throws Exception{long end=SystemClock.elapsedRealtime()+seconds*1000;while(SystemClock.elapsedRealtime()<end){JSONArray a=status().getJSONArray("runs");if(a.length()>0){JSONObject r=a.getJSONObject(0);if(state.equals(r.getJSONObject("job").getString("status"))&&(!state.equals("cancelled")||"confirmed".equals(r.optString("stop"))))return r;if(r.has("error")&&!r.isNull("error"))fail(r.getString("error"));}SystemClock.sleep(500);}throw new AssertionError("仕事の状態待ち: "+state);}
    private void debugView(String key){try{JSONObject data=new JSONObject();ui(()->{try{for(String field:new String[]{"selectedAgent","commandBusy","fetching","latest"}){java.lang.reflect.Field f=activity.getClass().getDeclaredField(field);f.setAccessible(true);Object value=f.get(activity);data.put(field,"latest".equals(field)&&value!=null?((JSONObject)value).optString("phase"):String.valueOf(value));}data.put("destroyed",activity.isDestroyed());data.put("attached",activity.getWindow().getDecorView().isAttachedToWindow());View run=find(root(),null,"pixel-sky-run");data.put("button",run instanceof TextView?((TextView)run).getText():"missing");data.put("buttonEnabled",run!=null&&run.isEnabled());data.put("buttonShown",run!=null&&run.isShown());Spinner choices=(Spinner)find(root(),null,"pixel-sky-agents");data.put("selectedPosition",choices==null?-1:choices.getSelectedItemPosition());data.put("choiceCount",choices==null||choices.getAdapter()==null?-1:choices.getAdapter().getCount());}catch(Exception e){}});record(key,data);}catch(Exception e){}}

    private void primaryClick(){long end=SystemClock.elapsedRealtime()+20000;while(SystemClock.elapsedRealtime()<end){boolean[] clicked={false};ui(()->{View b=find(root(),null,"pixel-sky-run");if(b!=null&&b.isEnabled()&&find(root(),"操作しています…",null)==null){b.requestRectangleOnScreen(new android.graphics.Rect(0,0,b.getWidth(),b.getHeight()),true);clicked[0]=b.performClick();}});if(clicked[0]){SystemClock.sleep(350);return;}SystemClock.sleep(200);}fail("Native primary action unavailable");}
    private static String hash(String text)throws Exception{byte[] d=java.security.MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte x:d)b.append(String.format("%02x",x));return b.toString();}
    private static JSONObject job(JSONArray runs,String id)throws Exception{for(int i=0;i<runs.length();i++)if(id.equals(runs.getJSONObject(i).getJSONObject("job").getString("id")))return runs.getJSONObject(i);return null;}
    @Test public void newRequestSaveStopAndReopen()throws Exception{
        String prompt=InstrumentationRegistry.getArguments().getString("request");assertNotNull("Explicit synthetic request required",prompt);assertTrue(prompt.startsWith("[RockstarOS 接続試験]"));assertTrue(prompt.length()<300);
        String expected="74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db";assertEquals("Verified cached model required",expected,InstrumentationRegistry.getArguments().getString("cacheShaVerified"));
        JSONObject before=status();JSONArray old=before.getJSONArray("runs");java.util.Set<String> ids=new java.util.HashSet<>();for(int i=0;i<old.length();i++){JSONObject r=old.getJSONObject(i);assertFalse("No existing job may be interrupted","active".equals(r.getJSONObject("job").getString("status")));assertFalse("No uncertain stop may be interrupted",java.util.Arrays.asList("requested","unconfirmed").contains(r.optString("stop")));ids.add(r.getJSONObject("job").getString("id"));}
        assertNotEquals("preparing",before.getString("phase"));record("beforeJobs",old.length());record("beforeModels",before.getJSONArray("models").length());record("beforeAgents",before.getJSONArray("agents").length());
        activity=ins.startActivitySync(new Intent().setClassName(context,"dev.rock.shell.SkyLinuxActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(1800);
        String modelId="hf-74a4da8c9fdbcd15bd1f6d01-chatml";selectAgent(modelId);
        if(!"ready".equals(status().getString("phase")))primaryClick();
        long end=SystemClock.elapsedRealtime()+60000;JSONObject s=status();while(!"ready".equals(s.getString("phase"))&&SystemClock.elapsedRealtime()<end){if("failed".equals(s.getString("phase")))fail(s.optString("error"));SystemClock.sleep(400);s=status();}assertEquals("ready",s.getString("phase"));assertEquals(expected,s.getJSONObject("environment").getString("modelSha256"));record("environment",s.getJSONObject("environment"));assertEquals(old.length(),s.getJSONArray("runs").length());
        SystemClock.sleep(1200);input(prompt);primaryClick();JSONObject result=null;String created=null;end=SystemClock.elapsedRealtime()+180000;
        while(SystemClock.elapsedRealtime()<end){JSONArray a=status().getJSONArray("runs");assertTrue("Only one new job may be submitted",a.length()<=old.length()+1);for(int i=0;i<a.length();i++){JSONObject r=a.getJSONObject(i);String id=r.getJSONObject("job").getString("id");if(!ids.contains(id)){if(created==null){created=id;record("newJobId",id);}assertEquals(created,id);result=r;}}
            if(result!=null&&"review".equals(result.getJSONObject("job").getString("status")))break;
            if(result!=null&&!result.isNull("error")&&!result.optString("error").isEmpty())fail(result.getString("error"));SystemClock.sleep(500);
        }
        assertNotNull(result);assertEquals("review",result.getJSONObject("job").getString("status"));assertEquals(expected,result.getString("modelSha256"));assertEquals(modelId,result.getJSONObject("agent").getString("modelId"));assertTrue(result.getString("text").length()>0);record("inputSha256",hash(prompt));record("outputSha256",hash(result.getString("text")));record("resultStatus","review");record("modelSha256",expected);
        JSONObject exported=api(new JSONObject().put("action","export").put("jobId",created).toString());record("exportSha256",hash(exported.getString("text")));record("exportBytes",exported.getString("text").getBytes(StandardCharsets.UTF_8).length);
        click("成果を文章で保存");long pickerEnd=SystemClock.elapsedRealtime()+15000;AccessibilityNodeInfo filename=null;while(filename==null&&SystemClock.elapsedRealtime()<pickerEnd){SystemClock.sleep(300);ins.getUiAutomation().clearCache();AccessibilityNodeInfo w=ins.getUiAutomation().getRootInActiveWindow();if(w!=null&&w.getPackageName()!=null&&w.getPackageName().toString().endsWith(".documentsui"))filename=edit(w);}assertNotNull("Real Android document picker",filename);
        String outputName="Sky-connected-"+java.util.UUID.randomUUID()+".txt";Bundle value=new Bundle();value.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,outputName);assertTrue(filename.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,value));SystemClock.sleep(700);ins.getUiAutomation().clearCache();assertNotNull("Unique filename must be visible before save",external(outputName));record("savedFilename",outputName);waitExternal("保存");
        final boolean[] saved={false};end=SystemClock.elapsedRealtime()+25000;while(!saved[0]&&SystemClock.elapsedRealtime()<end){ui(()->saved[0]=find(root(),"ファイルを保存しました。Skyを終了しても読めます。",null)!=null);SystemClock.sleep(250);}assertTrue("Native writer and byte readback",saved[0]);record("nativeSaveReadback",true);
        click("AIを停止する（成果は残す）");end=SystemClock.elapsedRealtime()+20000;s=status();while(!"stopped".equals(s.getString("phase"))&&SystemClock.elapsedRealtime()<end){SystemClock.sleep(250);s=status();}assertEquals("stopped",s.getString("phase"));
        ui(activity::finish);activity=ins.startActivitySync(new Intent().setClassName(context,"dev.rock.shell.SkyLinuxActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(1800);
        JSONArray after=status().getJSONArray("runs");assertEquals(old.length()+1,after.length());JSONObject reopened=job(after,created);assertNotNull(reopened);assertEquals(hash(result.getString("text")),hash(reopened.getString("text")));assertEquals("review",reopened.getJSONObject("job").getString("status"));
        for(int i=0;i<old.length();i++){JSONObject prior=old.getJSONObject(i);JSONObject same=job(after,prior.getJSONObject("job").getString("id"));assertNotNull(same);assertEquals("Existing job must remain byte-identical",hash(prior.toString()),hash(same.toString()));}
        assertEquals(before.getJSONArray("agents").length(),status().getJSONArray("agents").length());assertEquals(before.getJSONArray("models").length(),status().getJSONArray("models").length());record("reopenRetainedSameJobAndOutput",true);record("oldJobsUnchanged",true);record("afterJobs",after.length());record("accepted",true);
    }
}
