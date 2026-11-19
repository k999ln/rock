package dev.rock.shell;

import android.content.Context;
import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static org.junit.Assert.*;

/** Explicit owner acceptance only. Never enrolls keys, creates jobs or changes account grants. */
@RunWith(AndroidJUnit4.class)
public final class IndependentAccountCycleFinalTest {
    private final Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private JSONObject status() throws Exception {return SkyLinuxBridge.request(c,new JSONObject().put("action","status"));}
    private JSONObject load(String name)throws Exception {try(InputStream in=c.openFileInput(name)){return new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));}}
    private void save(String name,JSONObject value)throws Exception {try(OutputStream out=c.openFileOutput(name,Context.MODE_PRIVATE)){out.write(value.toString(2).getBytes(StandardCharsets.UTF_8));}}
    private String canonical(Object value)throws Exception {
        if(value instanceof JSONObject){JSONObject o=(JSONObject)value;List<String> keys=new ArrayList<>();Iterator<String> it=o.keys();while(it.hasNext())keys.add(it.next());Collections.sort(keys);List<String> pairs=new ArrayList<>();for(String k:keys)pairs.add(JSONObject.quote(k)+":"+canonical(o.get(k)));return "{"+String.join(",",pairs)+"}";}
        if(value instanceof JSONArray){JSONArray a=(JSONArray)value;List<String> values=new ArrayList<>();for(int i=0;i<a.length();i++)values.add(canonical(a.get(i)));return "["+String.join(",",values)+"]";}
        return value==null||value==JSONObject.NULL?"null":value instanceof String?JSONObject.quote((String)value):value.toString();
    }
    private String hash(String value)throws Exception {StringBuilder b=new StringBuilder();for(byte x:MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)))b.append(String.format(Locale.ROOT,"%02x",x));return b.toString();}
    @Test public void retainedJobsAndStoppedRuntime()throws Exception {
        Bundle args=InstrumentationRegistry.getArguments();String thread=args.getString("threadId","");assertTrue(thread.matches("[a-f0-9-]{36}"));
        Set<String> expectedNew=new HashSet<>(Arrays.asList(args.getString("newJobIds","").split(",")));assertEquals(2,expectedNew.size());
        JSONObject original=load("independent-account-original.json"),before=status();
        assertEquals(22,original.getJSONArray("runs").length());assertEquals(24,before.getJSONArray("runs").length());assertEquals(2,before.getJSONArray("models").length());assertEquals(6,before.getJSONArray("agents").length());
        Map<String,JSONObject> current=new HashMap<>();JSONArray runs=before.getJSONArray("runs");
        for(int i=0;i<runs.length();i++){JSONObject r=runs.getJSONObject(i);assertNotEquals("active",r.getJSONObject("job").getString("status"));assertFalse(Arrays.asList("requested","unconfirmed").contains(r.optString("stop")));current.put(r.getJSONObject("job").getString("id"),r);}
        for(int i=0;i<22;i++){JSONObject old=original.getJSONArray("runs").getJSONObject(i);String id=old.getJSONObject("job").getString("id");assertNotNull(current.get(id));assertEquals(canonical(old),canonical(current.get(id)));}
        JSONArray accepted=new JSONArray();
        for(String id:expectedNew){JSONObject r=current.get(id);assertNotNull(r);assertEquals(thread,r.getString("threadId"));assertEquals("review",r.getJSONObject("job").getString("status"));assertTrue(r.getString("input").startsWith("[RockstarOS 同期試験]"));assertFalse(r.getString("text").isEmpty());assertEquals("74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",r.getString("modelSha256"));assertEquals(0,r.getJSONObject("usage").getInt("cloudUsageMinor"));assertEquals(0,r.getJSONObject("usage").getInt("cloudTokensUsed"));accepted.put(new JSONObject().put("jobId",id).put("outputSha256",hash(r.getString("text"))).put("modelSha256",r.getString("modelSha256")).put("durationMs",r.optLong("durationMs")));}
        SkyLinuxBridge.request(c,new JSONObject().put("action","stop-environment"));JSONObject after=status();assertEquals("stopped",after.getString("phase"));assertEquals(canonical(before.getJSONArray("runs")),canonical(after.getJSONArray("runs")));EveAccountSync.sync(c,after);
        JSONObject remote=EveAccountSync.request(c,"/api/eve/history?id="+thread,"GET",null,true);assertEquals(4,remote.getJSONObject("session").getJSONArray("messages").length());
        JSONObject proof=new JSONObject().put("accepted",true).put("originalJobsRetained",22).put("jobs",24).put("models",2).put("agents",6).put("phase","stopped").put("activeJobs",0).put("threadId",thread).put("sameThreadMessages",4).put("newRuns",accepted).put("all24RunsUnchangedByStop",true).put("bridge",SkyLinuxBridge.diagnostics());
        save("independent-account-final.json",proof);save("independent-account-final-state.json",after);
    }
}
