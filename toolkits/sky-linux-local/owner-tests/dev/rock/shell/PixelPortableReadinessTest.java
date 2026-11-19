package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.io.OutputStream;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Existing-account read-only preflight. No runtime claim, presence, inference or new grant. */
@RunWith(AndroidJUnit4.class)
public final class PixelPortableReadinessTest {
    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object=(JSONObject)value;List<String> keys=new ArrayList<>();
            Iterator<String> it=object.keys();while(it.hasNext())keys.add(it.next());Collections.sort(keys);
            List<String> pairs=new ArrayList<>();for(String key:keys)pairs.add(JSONObject.quote(key)+":"+canonical(object.get(key)));
            return "{"+String.join(",",pairs)+"}";
        }
        if(value instanceof JSONArray){JSONArray a=(JSONArray)value;List<String> values=new ArrayList<>();for(int i=0;i<a.length();i++)values.add(canonical(a.get(i)));return "["+String.join(",",values)+"]";}
        return value==null||value==JSONObject.NULL?"null":value instanceof String?JSONObject.quote((String)value):value.toString();
    }
    @Test public void existingAccountCanInspectCommonRuntimeWithoutDispatch() throws Exception {
        assertEquals("physical",InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse("Owner unlock required",context.getSystemService(KeyguardManager.class).isDeviceLocked());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        assertTrue("Existing bridge key required",keys.containsAlias("sky-linux-bridge-ec-v1"));
        assertTrue("Existing account key required",keys.containsAlias("eve-account-session-aes-v1"));
        List<String> aliases=Collections.list(keys.aliases());Collections.sort(aliases);
        assertTrue("Existing account required",EveAccountSync.linked(context));
        assertFalse("Do not overlap foreground synchronization",EvePixelHostService.running());
        JSONObject identity=EveAccountSync.request(context,"/api/eve/runtime","GET",null,true);
        assertEquals(EveAccountSync.sessions(context).ownerUserId(),identity.getString("ownerUserId"));
        assertTrue(identity.getString("deviceId").matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"));
        assertEquals("Do not consume existing owner work",0,identity.getJSONArray("commands").length());
        JSONObject proof=new JSONObject().put("schema","rockstaros.pixel-runtime-readiness/1").put("accepted",false)
            .put("observedAt",System.currentTimeMillis()).put("runtimeApiConfirmed",true).put("existingOwnerDeviceBindingConfirmed",true)
            .put("pendingRuntimeCommands",0).put("linuxConfirmed",false).put("mainPortableCandidateInstalled",false)
            .put("newInference",0).put("newGrants",0).put("newPresence",0).put("newClaims",0);
        try(OutputStream out=context.openFileOutput("pixel-runtime-readiness.json",Context.MODE_PRIVATE)){out.write(proof.toString().getBytes(StandardCharsets.UTF_8));}
        JSONObject before=SkyLinuxBridge.request(context,new JSONObject().put("action","status"));
        JSONObject after=SkyLinuxBridge.request(context,new JSONObject().put("action","status"));
        for(String key:new String[]{"runs","models","agents"})assertEquals(key+" retained",canonical(before.getJSONArray(key)),canonical(after.getJSONArray(key)));
        List<String> afterAliases=Collections.list(keys.aliases());Collections.sort(afterAliases);assertEquals(aliases,afterAliases);
        proof.put("accepted",true).put("linuxConfirmed",true)
            .put("observedAt",System.currentTimeMillis()).put("keyAliasesUnchanged",true)
            .put("runtimeApiConfirmed",true).put("existingOwnerDeviceBindingConfirmed",true).put("pendingRuntimeCommands",0)
            .put("jobsRetained",before.getJSONArray("runs").length()).put("modelsRetained",before.getJSONArray("models").length())
            .put("agentsRetained",before.getJSONArray("agents").length()).put("linuxPhase",after.optString("phase"))
            .put("mainPortableCandidateInstalled",false).put("newInference",0).put("newGrants",0).put("newPresence",0).put("newClaims",0);
        try(OutputStream out=context.openFileOutput("pixel-runtime-readiness.json",Context.MODE_PRIVATE)){out.write(proof.toString().getBytes(StandardCharsets.UTF_8));}
    }
}
