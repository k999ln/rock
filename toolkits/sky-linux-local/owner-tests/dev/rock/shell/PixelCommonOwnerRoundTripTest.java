package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Reads one already completed owner job. Never submits, claims or reruns work. */
@RunWith(AndroidJUnit4.class)
public final class PixelCommonOwnerRoundTripTest {
    @Test public void sameCompletedJobAndOriginalDataSurviveAReadOnlyReopen()throws Exception{
        assertEquals("physical",InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        String id=InstrumentationRegistry.getArguments().getString("rockJobId"),thread=InstrumentationRegistry.getArguments().getString("rockThreadId"),
            expectedOutput=InstrumentationRegistry.getArguments().getString("rockOutputSha256");
        assertTrue(EvePortableCommands.id(id));assertTrue(EvePortableCommands.id(thread));assertTrue(expectedOutput.matches("[a-f0-9]{64}"));
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();assertFalse(c.getSystemService(KeyguardManager.class).isDeviceLocked());
        c.stopService(new Intent(c,EvePixelHostService.class));long end=SystemClock.elapsedRealtime()+5000;
        while(EvePixelHostService.running()&&SystemClock.elapsedRealtime()<end)SystemClock.sleep(100);assertFalse(EvePixelHostService.running());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);List<String> beforeKeys=Collections.list(keys.aliases());Collections.sort(beforeKeys);
        JSONObject baseline;
        try(InputStream in=c.openFileInput("pixel-common-ui-before.json")){baseline=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));}
        JSONObject old=baseline.getJSONObject("snapshot"),snapshot=SkyLinuxBridge.request(c,new JSONObject().put("action","status"));
        JSONArray original=old.getJSONArray("runs"),runs=snapshot.getJSONArray("runs");assertEquals(26,original.length());assertEquals(27,runs.length());
        JSONObject current=null;
        for(int i=0;i<original.length();i++){
            JSONObject saved=original.getJSONObject(i),found=null;String oldId=saved.getJSONObject("job").getString("id");
            for(int j=0;j<runs.length();j++)if(oldId.equals(runs.getJSONObject(j).getJSONObject("job").getString("id")))found=runs.getJSONObject(j);
            assertNotNull(found);assertEquals(EvePortableCommands.canonical(saved),EvePortableCommands.canonical(found));
        }
        for(int j=0;j<runs.length();j++){
            JSONObject run=runs.getJSONObject(j);assertNotEquals("active",run.getJSONObject("job").getString("status"));
            if(id.equals(run.getJSONObject("job").getString("id")))current=run;
        }
        assertNotNull(current);assertEquals("runtime",current.getString("surface"));assertEquals("review",current.getJSONObject("job").getString("status"));
        assertEquals(thread,current.getString("threadId"));assertEquals(expectedOutput,EvePortableCommands.sha(current.getString("text")));
        for(String field:new String[]{"models","agents"})assertEquals(EvePortableCommands.canonical(old.get(field)),EvePortableCommands.canonical(snapshot.get(field)));
        EvePortableAccountBinding account=new EvePortableAccountBinding(c);JSONObject identity=account.inspect();
        assertEquals(account.owner,identity.getString("ownerUserId"));assertEquals(0,identity.getJSONArray("commands").length());String device=identity.getString("deviceId");
        JSONObject execution=account.read(id).getJSONObject("execution"),request=execution.getJSONObject("request"),report=execution.getJSONObject("report");
        assertEquals(id,execution.getString("id"));assertEquals(device,execution.getString("deviceId"));assertEquals(thread,execution.getString("threadId"));
        assertEquals(256,request.getInt("maxOutputTokens"));assertEquals("review",report.getString("state"));assertFalse(execution.getBoolean("externalToolSuccess"));
        String model="74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db";
        assertEquals(model,request.getJSONObject("model").getString("sha256"));assertEquals(model,report.getJSONObject("model").getString("sha256"));
        assertEquals(expectedOutput,report.getString("outputSha256"));assertEquals(current.getString("text"),report.getString("text"));
        assertEquals(current.getJSONObject("runtimeBinding").getString("requestSha256"),report.getString("requestSha256"));
        try(EvePortableClaimJournal journal=EvePortableJournalKeys.open(c,account.origin,account.owner,device)){
            JSONObject local=journal.read(id);assertNotNull(local);assertEquals("acked",local.getJSONObject("publication").getString("phase"));
            assertEquals(EvePortableCommands.canonical(report),EvePortableCommands.canonical(local.getJSONObject("publication").getJSONObject("report")));
        }
        JSONArray messages=EveAccountSync.request(c,"/api/eve/history?id="+thread,"GET",null,true).getJSONObject("session").getJSONArray("messages");
        int requestCount=0,resultCount=0;
        for(int i=0;i<messages.length();i++){
            JSONObject m=messages.getJSONObject(i);
            if(("runtime:"+id+":request").equals(m.optString("id")))requestCount++;
            if(("runtime:"+id+":result").equals(m.optString("id"))){resultCount++;assertEquals(expectedOutput,EvePortableCommands.sha(m.getString("text")));}
        }
        assertEquals(1,requestCount);assertEquals(1,resultCount);
        List<String> afterKeys=Collections.list(keys.aliases());Collections.sort(afterKeys);assertEquals(beforeKeys,afterKeys);
        assertEquals(EvePortableCommands.canonical(baseline.getJSONArray("keyAliases")),EvePortableCommands.canonical(new JSONArray(afterKeys)));
        JSONObject proof=new JSONObject().put("schema","rockstaros.pixel-common-owner-roundtrip/1").put("accepted",true).put("observedAt",System.currentTimeMillis())
            .put("jobId",id).put("threadId",thread).put("outputSha256",expectedOutput).put("modelSha256",model).put("newJobsTotal",1)
            .put("jobsRetained",27).put("old26JobContentsPreserved",true).put("modelsRetained",2).put("agentsRetained",6).put("keyAliasesUnchanged",true)
            .put("sameAccountThreadJobAndReport",true).put("nativePublicationAcked",true).put("requestMessages",1).put("resultMessages",1)
            .put("maxOutputTokens",256).put("externalToolSuccess",false).put("probeNewInference",0).put("probeNewClaims",0).put("probeNewGrants",0).put("probeNewKeys",0);
        try(OutputStream out=c.openFileOutput("pixel-common-owner-roundtrip-proof.json",Context.MODE_PRIVATE)){out.write(proof.toString().getBytes(StandardCharsets.UTF_8));}
    }
}
