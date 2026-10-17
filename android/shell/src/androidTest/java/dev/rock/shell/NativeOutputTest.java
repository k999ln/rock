package dev.rock.shell;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.ClipboardManager;
import android.view.View;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.OutputTestTools;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Physical-safe acceptance. Reads Broker before/after; all execution is in the test Activity. */
@RunWith(AndroidJUnit4.class)
public final class NativeOutputTest {
    private Instrumentation instrumentation;
    private TestModeActivity activity;
    private ShellConnection broker;
    private int initialCount;
    private String initialSelection;
    @Before public void open() throws Exception {
        instrumentation=InstrumentationRegistry.getInstrumentation();broker=new ShellConnection(instrumentation.getTargetContext());
        initialCount=new JSONObject(broker.snapshot()).getInt("totalWorkCount");initialSelection=broker.skySelection();
        Intent intent=new Intent(instrumentation.getTargetContext(),TestModeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity=(TestModeActivity)instrumentation.startActivitySync(intent);instrumentation.waitForIdleSync();
    }
    @After public void closeAndVerifyIsolation() throws Exception {
        instrumentation.runOnMainSync(()->activity.finish());instrumentation.waitForIdleSync();
        assertEquals(initialCount,new JSONObject(broker.snapshot()).getInt("totalWorkCount"));assertEquals(initialSelection,broker.skySelection());
    }
    @Test public void allSeventeenOutputsAreNativeAndExportable() throws Exception {
        click("test-run-all");waitText("test-status","17 / 17 確認済み");
        final String[] export={""};instrumentation.runOnMainSync(()->{try {export[0]=activity.exportResults();}catch(Exception e){throw new AssertionError(e);}});
        JSONObject data=new JSONObject(export[0]);assertFalse(data.getBoolean("externalCalls"));assertTrue(data.getBoolean("testOnly"));assertEquals(17,data.getJSONArray("results").length());
        int simulated=0;
        for(int i=0;i<17;i++){JSONObject result=data.getJSONArray("results").getJSONObject(i);assertTrue(result.isNull("error"));if(result.getString("mode").equals("simulation"))simulated++;}
        assertEquals(9,simulated);
        if("true".equals(InstrumentationRegistry.getArguments().getString("rockCaptureUi"))) { capture("native-test-entry.png"); scrollToOutput(); capture("native-test-results.png"); }
    }
    @Test public void editedInputChangesRealOutputAndResetClearsEverything() throws Exception {
        instrumentation.runOnMainSync(()->((EditText)tagged("test-input")).setText("id,name\n3, gamma\n1, alpha\n3,gamma"));
        click("test-run");waitText("test-output","1,alpha\n3,gamma");
        click("test-copy");waitText("test-status","コピーしました");
        instrumentation.runOnMainSync(()->assertTrue(activity.getSystemService(ClipboardManager.class).getPrimaryClip().getItemAt(0).getText().toString().contains("3,gamma")));
        click("test-reset");waitText("test-status","0 / 17 確認済み");
        assertFalse(read("test-output").contains("3,gamma"));
        final String[] export={""};instrumentation.runOnMainSync(()->{try{export[0]=activity.exportResults();}catch(Exception e){throw new AssertionError(e);}});
        assertEquals(0,new JSONObject(export[0]).getJSONArray("results").length());
    }
    @Test public void overBudgetFixtureIsRejectedAndAiIsNeverClaimedReal() throws Exception {
        select("wallet");instrumentation.runOnMainSync(()->((EditText)tagged("test-option")).setText("1001"));
        click("test-run");waitText("test-output","使用額が予約額を超えています");
        select("cloud-ai");click("test-run");waitText("test-output","モデルの回答: なし");
        assertTrue(read("test-output").contains("模擬AI応答"));
        if("true".equals(InstrumentationRegistry.getArguments().getString("rockCaptureUi"))){ scrollToOutput(); capture("native-test-ai.png"); }
    }
    @Test public void homeOpensTestActivityWithoutBrowserOrSignin() throws Exception {
        Intent intent=new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity home=(MainActivity)instrumentation.startActivitySync(intent);instrumentation.waitForIdleSync();
        Instrumentation.ActivityMonitor monitor=instrumentation.addMonitor(TestModeActivity.class.getName(),null,false);
        instrumentation.runOnMainSync(()->home.getWindow().getDecorView().findViewWithTag("native-test-entry").performClick());
        ActivityResult target=new ActivityResult(instrumentation.waitForMonitorWithTimeout(monitor,5000));
        instrumentation.removeMonitor(monitor);assertNotNull(target.activity);
        instrumentation.runOnMainSync(()->{target.activity.finish();home.finish();});
    }
    private static final class ActivityResult { final android.app.Activity activity;ActivityResult(android.app.Activity value){activity=value;} }
    private void select(String id) {
        for(int i=0;i<OutputTestTools.SCENARIOS.size();i++)if(OutputTestTools.SCENARIOS.get(i).id.equals(id)){final int index=i;instrumentation.runOnMainSync(()->((Spinner)tagged("test-selector")).setSelection(index));instrumentation.waitForIdleSync();return;}
        fail(id);
    }
    private View tagged(String tag){View v=activity.getWindow().getDecorView().findViewWithTag(tag);assertNotNull(tag,v);return v;}
    private void click(String tag){instrumentation.runOnMainSync(()->tagged(tag).performClick());instrumentation.waitForIdleSync();}
    private String read(String tag){final String[] text={""};instrumentation.runOnMainSync(()->text[0]=((TextView)tagged(tag)).getText().toString());return text[0];}
    private void waitText(String tag,String expected){long until=android.os.SystemClock.elapsedRealtime()+10000;while(android.os.SystemClock.elapsedRealtime()<until){if(read(tag).contains(expected))return;android.os.SystemClock.sleep(50);}assertTrue(read(tag),read(tag).contains(expected));}
    private void scrollToOutput() { instrumentation.runOnMainSync(()->((android.widget.ScrollView)tagged("test-scroll")).fullScroll(View.FOCUS_DOWN));instrumentation.waitForIdleSync(); }
    private void capture(String name) throws Exception {
        instrumentation.waitForIdleSync();instrumentation.getUiAutomation().waitForIdle(200,3000);
        android.graphics.Bitmap bitmap=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(bitmap);
        try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(instrumentation.getTargetContext().getCacheDir(),name))){assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out));}finally{bitmap.recycle();}
    }
}
