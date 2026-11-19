package dev.rock.shell;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Explicit owner-only suite, outside default CI source sets. Requires the owner's ready Pixel. */
@RunWith(AndroidJUnit4.class)
public class PixelLinuxSkyPhysicalTest {
    private final Instrumentation ins=InstrumentationRegistry.getInstrumentation();
    private final Context context=ins.getTargetContext();
    private Activity activity;
    private void ui(Runnable action){ins.runOnMainSync(action);ins.waitForIdleSync();}
    private View find(View v,String text,String tag){
        if(tag!=null&&tag.equals(v.getTag()))return v;
        if(text!=null&&v instanceof TextView&&text.equals(((TextView)v).getText().toString()))return v;
        if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){View found=find(g.getChildAt(i),text,tag);if(found!=null)return found;}}
        return null;
    }
    private EditText field(View v,String hint){if(v instanceof EditText&&hint.contentEquals(((EditText)v).getHint()))return (EditText)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){EditText f=field(g.getChildAt(i),hint);if(f!=null)return f;}}return null;}
    private Spinner spinner(View v){if(v instanceof Spinner)return (Spinner)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){Spinner f=spinner(g.getChildAt(i));if(f!=null)return f;}}return null;}
    private View root(){return activity.getWindow().getDecorView();}
    private void click(String text){long end=SystemClock.elapsedRealtime()+25000;boolean idle=false;while(SystemClock.elapsedRealtime()<end){final boolean[] ready={false};ui(()->{View v=find(root(),text,null);ready[0]=v!=null&&v.isEnabled()&&find(root(),"操作しています…",null)==null;});if(ready[0]){idle=true;break;}SystemClock.sleep(250);}assertTrue("UI operation must finish before "+text,idle);ui(()->{View v=find(root(),text,null);assertNotNull(text,v);v.requestRectangleOnScreen(new android.graphics.Rect(0,0,v.getWidth(),v.getHeight()),true);assertTrue(text,v.performClick());});}
    private JSONObject api(String action)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:5199/__sky/linux").openConnection();c.setRequestMethod("POST");c.setConnectTimeout(2000);c.setReadTimeout(10000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Origin","http://127.0.0.1:5199");
        try{c.getOutputStream().write(action.getBytes(StandardCharsets.UTF_8));assertEquals(200,c.getResponseCode());ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);assertTrue(out.size()<5000000);}}return new JSONObject(out.toString("UTF-8"));}finally{c.disconnect();}
    }
    private JSONObject waitJob(String previous,String state,long seconds)throws Exception{
        long end=SystemClock.elapsedRealtime()+seconds*1000;JSONObject result=null;
        while(SystemClock.elapsedRealtime()<end){JSONObject s=api("{\"action\":\"status\"}");JSONArray runs=s.getJSONArray("runs");if(runs.length()>0){JSONObject r=runs.getJSONObject(0);if(!r.getJSONObject("job").getString("id").equals(previous)&&state.equals(r.getJSONObject("job").getString("status"))&&(!"cancelled".equals(state)||"confirmed".equals(r.optString("stop"))))return r;}SystemClock.sleep(700);}
        fail("Expected new job state "+state);return result;
    }
    @Test public void realRequestSaveAndStopFromSky()throws Exception{
        String input=InstrumentationRegistry.getArguments().getString("request");assertNotNull("Explicit owner request required",input);
        activity=ins.startActivitySync(new Intent(context,SkyLinuxActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long end=SystemClock.elapsedRealtime()+180000;boolean ready=false;
        while(SystemClock.elapsedRealtime()<end){final boolean[] state={false};ui(()->{View v=find(root(),null,"pixel-sky-run");state[0]=v.isEnabled()&&"この担当に依頼する".contentEquals(((TextView)v).getText());});if(state[0]){ready=true;break;}SystemClock.sleep(700);}assertTrue("Pixel Sky must be ready",ready);
        JSONObject before=api("{\"action\":\"status\"}");String previous=before.getJSONArray("runs").getJSONObject(0).getJSONObject("job").getString("id");
        click("担当・実行の設定  ＋");click("自分の担当を追加する  ＋");
        final int oldAgents=before.getJSONArray("agents").length();
        ui(()->{field(root(),"担当の名前").setText("avokadoのSky改善担当");field(root(),"何を任せる担当か").setText("avokadoのSky開発を支えるAI担当の役割と依頼文を短い日本語で整理する。人の採用と混同せず、外部操作はしない。成果は本人の確認が必要な下書きとする。");});
        click("この担当を追加する");
        end=SystemClock.elapsedRealtime()+15000;JSONObject added=null;while(SystemClock.elapsedRealtime()<end){JSONObject candidate=api("{\"action\":\"status\"}");if(candidate.getJSONArray("agents").length()>=oldAgents&&candidate.getJSONArray("agents").toString().contains("avokadoのSky改善担当")){added=candidate;break;}SystemClock.sleep(500);}assertNotNull("Native add agent",added);SystemClock.sleep(1800);
        final String agentName="avokadoのSky改善担当";ui(()->{Spinner choices=spinner(root());for(int i=0;i<choices.getCount();i++)if(agentName.equals(choices.getItemAtPosition(i).toString()))choices.setSelection(i);});SystemClock.sleep(500);
        click("新しい依頼を書く");
        ui(()->{((EditText)find(root(),null,"pixel-sky-request")).setText(input);checkConsent(root());});
        click("この担当に依頼する");JSONObject result=waitJob(previous,"review",180);assertFalse(result.getString("text").isBlank());assertEquals("avokadoのSky改善担当",result.getJSONObject("agent").getString("name"));String job=result.getJSONObject("job").getString("id");
        JSONObject receipt=new JSONObject().put("job",result).put("environment",api("{\"action\":\"status\"}").getJSONObject("environment"));
        SystemClock.sleep(1800);click("成果を文章で保存");
        end=SystemClock.elapsedRealtime()+120000;boolean saved=false;
        while(SystemClock.elapsedRealtime()<end){final boolean[] state={false};ui(()->state[0]=find(root(),"文章を保存しました。Skyを終了しても読めます。",null)!=null);if(state[0]){saved=true;break;}SystemClock.sleep(700);}assertTrue("Actual Android picker save and readback required",saved);receipt.put("androidPickerSaveAndAppReadback",true);
        click("新しい依頼を書く");ui(()->{((EditText)find(root(),null,"pixel-sky-request")).setText("Skyで使うAI担当の作業案を100項目、目的と手順を付けて日本語で詳しく書いてください。外部操作はしません。");checkConsent(root());});click("この担当に依頼する");JSONObject active=waitJob(job,"active",15);String stopId=active.getJSONObject("job").getString("id");SystemClock.sleep(5000);click("この仕事を停止する");JSONObject stopped=waitJob(job,"cancelled",25);assertEquals(stopId,stopped.getJSONObject("job").getString("id"));assertEquals("confirmed",stopped.getString("stop"));assertTrue(stopped.isNull("text"));receipt.put("stoppedJob",stopped);
        click("AIを停止する（成果は残す）");JSONObject state=null;end=SystemClock.elapsedRealtime()+25000;while(SystemClock.elapsedRealtime()<end){state=api("{\"action\":\"status\"}");if("stopped".equals(state.getString("phase")))break;SystemClock.sleep(500);}assertEquals("stopped",state.getString("phase"));receipt.put("phaseAfterStop",state.getString("phase"));
        try(FileOutputStream out=context.openFileOutput("pixel-linux-ui-receipt.json",Context.MODE_PRIVATE)){out.write(receipt.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
    private void checkConsent(View v){if(v instanceof CheckBox&&((CheckBox)v).getText().toString().startsWith("料金と実行先"))((CheckBox)v).setChecked(true);if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++)checkConsent(g.getChildAt(i));}}
}
