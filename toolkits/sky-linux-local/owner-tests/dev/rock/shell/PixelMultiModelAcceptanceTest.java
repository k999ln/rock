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
public class PixelMultiModelAcceptanceTest {
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
    private View root(){for(Activity a:androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED))if(a instanceof SkyLinuxActivity)activity=a;return activity.getWindow().getDecorView();}
    private View find(View v,String text,String tag){if(!v.isShown())return null;if(tag!=null&&tag.equals(v.getTag()))return v;if(text!=null&&v instanceof TextView&&text.equals(((TextView)v).getText().toString()))return v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View n=find(((ViewGroup)v).getChildAt(i),text,tag);if(n!=null)return n;}return null;}
    private void click(String text){long end=SystemClock.elapsedRealtime()+25000;while(SystemClock.elapsedRealtime()<end){boolean[] ready={false};ui(()->{View v=find(root(),text,null);ready[0]=v!=null&&v.isEnabled()&&v.isShown()&&find(root(),"操作しています…",null)==null;});if(ready[0]){ui(()->{View v=find(root(),text,null);v.requestRectangleOnScreen(new android.graphics.Rect(0,0,v.getWidth(),v.getHeight()),true);assertTrue(v.performClick());});SystemClock.sleep(350);return;}SystemClock.sleep(200);}debugView("failedBeforeClick");fail("操作できません: "+text);}
    private JSONObject api(String value)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:5199/__sky/linux").openConnection();c.setRequestMethod("POST");c.setConnectTimeout(2000);c.setReadTimeout(15000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Origin","http://127.0.0.1:5199");try{c.getOutputStream().write(value.getBytes(StandardCharsets.UTF_8));assertEquals(200,c.getResponseCode());ByteArrayOutputStream b=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){byte[] p=new byte[8192];int n;while((n=in.read(p))!=-1){b.write(p,0,n);assertTrue(b.size()<5000000);}}return new JSONObject(b.toString("UTF-8"));}finally{c.disconnect();}}
    private JSONObject status()throws Exception{return api("{\"action\":\"status\"}");}
    private void record(String key,Object value)throws Exception{receipt.put(key,value);try(FileOutputStream out=context.openFileOutput("pixel-multi-model-receipt.json",Context.MODE_PRIVATE)){out.write(receipt.toString(2).getBytes(StandardCharsets.UTF_8));}}
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
    private void debugView(String key){try{JSONObject data=new JSONObject();ui(()->{try{for(String field:new String[]{"selectedAgent","commandBusy","fetching","latest"}){java.lang.reflect.Field f=SkyLinuxActivity.class.getDeclaredField(field);f.setAccessible(true);Object value=f.get(activity);data.put(field,"latest".equals(field)&&value!=null?((JSONObject)value).optString("phase"):String.valueOf(value));}data.put("destroyed",activity.isDestroyed());data.put("attached",activity.getWindow().getDecorView().isAttachedToWindow());View run=find(root(),null,"pixel-sky-run");data.put("button",run instanceof TextView?((TextView)run).getText():"missing");data.put("buttonEnabled",run!=null&&run.isEnabled());data.put("buttonShown",run!=null&&run.isShown());Spinner choices=(Spinner)find(root(),null,"pixel-sky-agents");data.put("selectedPosition",choices==null?-1:choices.getSelectedItemPosition());data.put("choiceCount",choices==null||choices.getAdapter()==null?-1:choices.getAdapter().getCount());}catch(Exception e){}});record(key,data);}catch(Exception e){}}
    @Test public void downloadGuidanceAndCacheReuse()throws Exception{
        JSONObject before=status();int jobs=before.getJSONArray("runs").length(),roles=before.getJSONArray("agents").length();
        activity=ins.startActivitySync(new Intent(context,SkyLinuxActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(1800);
        click("担当・実行の設定  ＋");
        ui(()->{try{java.lang.reflect.Field field=SkyLinuxActivity.class.getDeclaredField("availableModels");field.setAccessible(true);JSONArray models=(JSONArray)field.get(activity);for(int i=0;i<models.length();i++)if("hf-74a4da8c9fdbcd15bd1f6d01-chatml".equals(models.getJSONObject(i).getString("id")))((Spinner)find(root(),null,"pixel-sky-models")).setSelection(i);}catch(Exception e){throw new AssertionError(e);}});SystemClock.sleep(1200);
        ui(()->{try{java.lang.reflect.Field field=SkyLinuxActivity.class.getDeclaredField("model");field.setAccessible(true);String text=((TextView)field.get(activity)).getText().toString();for(String required:new String[]{"文章を作るAI本体","491 MB","Sky内部","再利用","通信"})assertTrue(required,text.contains(required));}catch(Exception e){throw new AssertionError(e);}});
        click("選んだAIを準備する");long end=SystemClock.elapsedRealtime()+60000;JSONObject state=status();
        while(SystemClock.elapsedRealtime()<end&&!"ready".equals(state.getString("phase"))){SystemClock.sleep(300);state=status();}
        assertEquals("ready",state.getString("phase"));assertEquals("74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",state.getJSONObject("environment").getString("modelSha256"));
        click("AIを停止する（成果は残す）");end=SystemClock.elapsedRealtime()+20000;state=status();while(SystemClock.elapsedRealtime()<end&&!"stopped".equals(state.getString("phase"))){SystemClock.sleep(300);state=status();}
        assertEquals("stopped",state.getString("phase"));assertEquals(jobs,state.getJSONArray("runs").length());assertEquals(roles,state.getJSONArray("agents").length());
        JSONObject result=new JSONObject().put("accepted",true).put("purposeCapacityStorageReuseShown",true).put("verifiedCachedModelPrepared",true).put("noNewJobs",true).put("noExportFilesCreated",true).put("jobs",jobs).put("agents",roles).put("environment",state.getJSONObject("environment"));
        try(FileOutputStream out=context.openFileOutput("pixel-download-guidance.json",Context.MODE_PRIVATE)){out.write(result.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
    @Test public void inspectPreparedRoleView()throws Exception{activity=ins.startActivitySync(new Intent(context,SkyLinuxActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(2500);debugView("initialView");selectAgent("hf-74a4da8c9fdbcd15bd1f6d01-chatml");SystemClock.sleep(2000);debugView("selectedView");}
    @Test public void portableDefinitions()throws Exception{
        JSONObject before=status();int models=before.getJSONArray("models").length(),roles=before.getJSONArray("agents").length();
        activity=ins.startActivitySync(new Intent(context,SkyLinuxActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(2000);
        click("担当・実行の設定  ＋");click("別のAIを設定ファイルから追加");openFile("Sky-model-config-20261020.json");waitExternal("確認して追加");SystemClock.sleep(1200);assertEquals(models,status().getJSONArray("models").length());
        click("選んだ担当の設定を保存");SystemClock.sleep(1000);AccessibilityNodeInfo field=edit(ins.getUiAutomation().getRootInActiveWindow());assertNotNull(field);String file=temporaryExport("json");Bundle value=new Bundle();value.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,file);assertTrue(field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,value));assertTrue(externalClick("保存")||externalClick("SAVE"));
        long end=SystemClock.elapsedRealtime()+20000;boolean[] saved={false};while(SystemClock.elapsedRealtime()<end&&!saved[0]){ui(()->saved[0]=find(root(),"ファイルを保存しました。Skyを終了しても読めます。",null)!=null);SystemClock.sleep(200);}assertTrue(saved[0]);
        click("担当を設定ファイルから追加");openFile(file);waitExternal("確認して追加");SystemClock.sleep(1200);assertEquals(roles,status().getJSONArray("agents").length());
        JSONObject result=new JSONObject().put("accepted",true).put("modelFileImportedWithoutDuplicates",true).put("agentFileSavedAndReimportedWithoutDuplicates",true).put("agentFilename",file).put("models",models).put("agents",roles);try(FileOutputStream out=context.openFileOutput("pixel-portable-definitions.json",Context.MODE_PRIVATE)){out.write(result.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
    @Test public void coldStartWithoutCommands()throws Exception{
        int expected=Integer.parseInt(InstrumentationRegistry.getArguments().getString("expectedJobs","15"));
        activity=ins.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(2000);click("Sky");click("このPixelで依頼する");SystemClock.sleep(800);click("Skyを起動する");
        JSONObject state=null;long end=SystemClock.elapsedRealtime()+75000;while(SystemClock.elapsedRealtime()<end){try{state=status();break;}catch(Exception e){SystemClock.sleep(500);}}assertNotNull("Skyへの接続",state);
        try(ParcelFileDescriptor command=ins.getUiAutomation().executeShellCommand("cmd statusbar expand-notifications")){SystemClock.sleep(700);}
        end=SystemClock.elapsedRealtime()+10000;boolean returned=false;while(SystemClock.elapsedRealtime()<end){if(externalClick("Skyにつながりました")){returned=true;break;}SystemClock.sleep(300);}assertTrue("Skyへ戻る通知",returned);
        end=SystemClock.elapsedRealtime()+45000;while(SystemClock.elapsedRealtime()<end){state=status();if("ready".equals(state.getString("phase")))break;SystemClock.sleep(500);}assertEquals("ready",state.getString("phase"));assertEquals(expected,state.getJSONArray("runs").length());
        click("AIを停止する（成果は残す）");end=SystemClock.elapsedRealtime()+20000;while(SystemClock.elapsedRealtime()<end){state=status();if("stopped".equals(state.getString("phase")))break;SystemClock.sleep(500);}assertEquals("stopped",state.getString("phase"));assertEquals(expected,state.getJSONArray("runs").length());
        JSONObject result=new JSONObject().put("accepted",true).put("terminalCommands",0).put("noJobReplay",true).put("jobs",expected).put("models",state.getJSONArray("models").length()).put("agents",state.getJSONArray("agents").length()).put("environment",state.getJSONObject("environment"));try(FileOutputStream out=context.openFileOutput("pixel-multi-model-cold-start.json",Context.MODE_PRIVATE)){out.write(result.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
    @Test public void importPrepareRunSaveStopOnPixel()throws Exception{
        JSONObject before=status();record("beforeModels",before.getJSONArray("models").length());record("beforeAgents",before.getJSONArray("agents").length());record("beforeJobs",before.getJSONArray("runs").length());
        activity=ins.startActivitySync(new Intent(context,SkyLinuxActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));SystemClock.sleep(1800);
        click("担当・実行の設定  ＋");
        click("配布ページのリンクからAIを追加  ＋");ui(()->((EditText)find(root(),null,"pixel-sky-model-link")).setText("https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/blob/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"));click("リンク先のAIを確認する");long previewEnd=SystemClock.elapsedRealtime()+25000;boolean preview=false;while(SystemClock.elapsedRealtime()<previewEnd){if(externalClick("確認して追加")){preview=true;break;}SystemClock.sleep(300);}assertTrue("配布元の確認",preview);SystemClock.sleep(1200);
        JSONObject s=status();String modelId="hf-74a4da8c9fdbcd15bd1f6d01-chatml";assertEquals(modelId,s.getString("selectedModelId"));record("modelAdded",true);record("modelLinkResolvedOnPixel",true);
        click("担当を設定ファイルから追加");openFile("Sky-agent.json");waitExternal("確認して追加");SystemClock.sleep(1200);record("agentImported",true);
        click("選んだAIを準備する");long end=SystemClock.elapsedRealtime()+600000;boolean ready=false;while(SystemClock.elapsedRealtime()<end){s=status();if("ready".equals(s.getString("phase"))&&s.getJSONArray("preparedModels").toString().contains(modelId)){ready=true;break;}if("failed".equals(s.getString("phase")))fail(s.optString("error"));SystemClock.sleep(800);}assertTrue("モデル準備",ready);record("prepared",s.getJSONObject("environment"));
        selectAgent(modelId);input("avokadoで使うAI担当を増やします。次の3つの役割を、各一行の短い担当説明に整えてください。依頼整理係：依頼の目的と必要な情報をまとめる。調査係：公開情報を調べて根拠を付ける。下書き係：説明文や提案書の案を書く。人間の求人は作らず、3行だけで答えてください。");String priorId=status().getJSONArray("runs").length()>0?status().getJSONArray("runs").getJSONObject(0).getJSONObject("job").getString("id"):"";click("この担当に依頼する");JSONObject result=latestJob("review",200);assertFalse("新しい仕事を確認",priorId.equals(result.getJSONObject("job").getString("id")));assertEquals(modelId,result.getJSONObject("agent").getString("modelId"));assertEquals("74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",result.getString("modelSha256"));assertTrue(result.getString("text").length()>0);record("result",result);
        click("成果を文章で保存");SystemClock.sleep(1000);AccessibilityNodeInfo filename=edit(ins.getUiAutomation().getRootInActiveWindow());assertNotNull("保存ファイル名",filename);Bundle filenameValue=new Bundle();String outputName=temporaryExport("txt");filenameValue.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,outputName);assertTrue(filename.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,filenameValue));record("savedFilename",outputName);long saveEnd=SystemClock.elapsedRealtime()+20000;boolean saved=false;while(SystemClock.elapsedRealtime()<saveEnd){if(externalClick("保存")||externalClick("SAVE")){saved=true;break;}SystemClock.sleep(250);}assertTrue("Androidの保存操作",saved);SystemClock.sleep(1200);
        // The system save picker may ask before replacing an existing filename.
        if(external("置き換えますか？")!=null)fail("保存先は既存ファイルと区別してください");
        final boolean[] savedMessage={false};long readbackEnd=SystemClock.elapsedRealtime()+20000;while(SystemClock.elapsedRealtime()<readbackEnd&&!savedMessage[0]){ui(()->savedMessage[0]=find(root(),"ファイルを保存しました。Skyを終了しても読めます。",null)!=null);SystemClock.sleep(250);}assertTrue("選択先の読戻し",savedMessage[0]);record("nativeSaveReadback",true);
        input("avokadoのAI担当ができる作業を100項目、目的と手順を付けて日本語で詳しく書いてください。実行はせず文章だけを作ります。");click("この担当に依頼する");JSONObject active=latestJob("active",15);SystemClock.sleep(2500);click("この仕事を停止する");JSONObject stopped=latestJob("cancelled",25);assertEquals(active.getJSONObject("job").getString("id"),stopped.getJSONObject("job").getString("id"));assertTrue(stopped.isNull("text"));record("stoppedJob",stopped);
        click("AIを停止する（成果は残す）");end=SystemClock.elapsedRealtime()+25000;while(SystemClock.elapsedRealtime()<end){s=status();if("stopped".equals(s.getString("phase")))break;SystemClock.sleep(250);}assertEquals("stopped",s.getString("phase"));record("finalModels",s.getJSONArray("models").length());record("finalAgents",s.getJSONArray("agents").length());record("finalJobs",s.getJSONArray("runs").length());record("accepted",true);
    }
}
