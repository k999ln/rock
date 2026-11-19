package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
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

/** Reads the prepared existing model. No presence, claim, generation or new key. */
@RunWith(AndroidJUnit4.class)
public final class PixelPreparedRuntimeReadinessTest {
    @Test public void existingPreparedModelPreservesOriginalDataWithoutDispatch()throws Exception{
        assertEquals("physical",InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse(context.getSystemService(KeyguardManager.class).isDeviceLocked());
        assertFalse(EvePixelHostService.running());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        assertTrue(keys.containsAlias("sky-linux-bridge-ec-v1"));assertTrue(keys.containsAlias("eve-account-session-aes-v1"));
        List<String> beforeKeys=Collections.list(keys.aliases());Collections.sort(beforeKeys);
        JSONObject original;
        try(InputStream in=context.openFileInput("pixel-common-ui-before.json")){
            original=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8)).getJSONObject("snapshot");
        }
        EvePortableAccountBinding account=new EvePortableAccountBinding(context);JSONObject identity=account.inspect();
        assertEquals(account.owner,identity.getString("ownerUserId"));assertEquals(0,identity.getJSONArray("commands").length());
        JSONObject current=SkyLinuxBridge.request(context,new JSONObject().put("action","status"));
        for(String k:new String[]{"runs","models","agents"})assertEquals(k+" unchanged",EvePortableCommands.canonical(original.get(k)),EvePortableCommands.canonical(current.get(k)));
        assertEquals("ready",current.getString("phase"));assertEquals(26,current.getJSONArray("runs").length());
        assertEquals(2,current.getJSONArray("models").length());assertEquals(6,current.getJSONArray("agents").length());
        String expected="74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db";
        JSONArray prepared=current.getJSONArray("preparedModels"),models=current.getJSONArray("models");boolean found=false;
        for(int i=0;i<models.length();i++){
            JSONObject model=models.getJSONObject(i);if(!expected.equals(model.optString("sha256")))continue;
            for(int j=0;j<prepared.length();j++)if(model.getString("id").equals(prepared.getString(j)))found=true;
        }
        assertTrue("The already cached selected 0.5B model must be prepared",found);
        JSONObject environment=current.getJSONObject("environment");assertEquals("linux",environment.getString("platform"));
        assertEquals("aarch64",environment.getString("architecture"));assertEquals(expected,environment.getString("modelSha256"));
        JSONObject command=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-capabilities");
        PixelPortableBridgeProtocol.validate(command,SkyLinuxBridge.request(context,command));
        List<String> afterKeys=Collections.list(keys.aliases());Collections.sort(afterKeys);assertEquals(beforeKeys,afterKeys);
        JSONObject proof=new JSONObject().put("schema","rockstaros.pixel-prepared-runtime-proof/1").put("accepted",true)
            .put("observedAt",System.currentTimeMillis()).put("linuxPhase","ready").put("modelSha256",expected)
            .put("oldJobContentsPreserved",true).put("jobsRetained",26).put("modelsRetained",2).put("agentsRetained",6)
            .put("keyAliasesUnchanged",true).put("runtimeAbiConfirmed",true).put("pendingRuntimeCommands",0)
            .put("newInference",0).put("newPresence",0).put("newClaims",0).put("newGrants",0).put("newKeys",0);
        try(OutputStream out=context.openFileOutput("pixel-prepared-runtime-proof.json",Context.MODE_PRIVATE)){
            out.write(proof.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
}
