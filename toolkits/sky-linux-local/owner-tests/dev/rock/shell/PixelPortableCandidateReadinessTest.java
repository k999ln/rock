package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual candidate transport and existing key checks. Never claims or dispatches owner work. */
@RunWith(AndroidJUnit4.class)
public final class PixelPortableCandidateReadinessTest {
    private static String canonical(Object value) throws Exception {
        if(value instanceof JSONObject){JSONObject o=(JSONObject)value;List<String> keys=new ArrayList<>();
            Iterator<String> names=o.keys();while(names.hasNext())keys.add(names.next());Collections.sort(keys);
            List<String> pairs=new ArrayList<>();for(String k:keys)pairs.add(JSONObject.quote(k)+":"+canonical(o.get(k)));
            return "{"+String.join(",",pairs)+"}";}
        if(value instanceof JSONArray){JSONArray a=(JSONArray)value;List<String> values=new ArrayList<>();
            for(int i=0;i<a.length();i++)values.add(canonical(a.get(i)));return "["+String.join(",",values)+"]";}
        return value==null||value==JSONObject.NULL?"null":value instanceof String?JSONObject.quote((String)value):value.toString();
    }
    private static void save(Context context,JSONObject proof)throws Exception{
        proof.put("observedAt",System.currentTimeMillis());
        try(OutputStream out=context.openFileOutput("pixel-portable-candidate-readiness.json",Context.MODE_PRIVATE)){
            out.write(proof.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
    @Test public void actualCandidateCanInspectAndReadExistingPrivateLinuxWithoutDispatch()throws Exception{
        assertEquals("physical",InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse("Owner unlock required",context.getSystemService(KeyguardManager.class).isDeviceLocked());
        assertFalse("Do not overlap foreground synchronization",EvePixelHostService.running());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        assertTrue(keys.containsAlias("sky-linux-bridge-ec-v1"));assertTrue(keys.containsAlias("eve-account-session-aes-v1"));
        List<String> aliases=Collections.list(keys.aliases());Collections.sort(aliases);
        JSONObject proof=new JSONObject().put("schema","rockstaros.pixel-portable-candidate-readiness/1")
            .put("accepted",false).put("newInference",0).put("newGrants",0).put("newKeys",0)
            .put("newPresence",0).put("newClaims",0);save(context,proof);
        EvePortableAccountBinding account=new EvePortableAccountBinding(context);
        JSONObject identity=account.inspect();assertEquals(account.owner,identity.getString("ownerUserId"));
        String device=identity.getString("deviceId");assertTrue(EvePortableCommands.id(device));
        assertEquals("Do not consume existing owner work",0,identity.getJSONArray("commands").length());
        proof.put("actualNativeHttpsConfirmed",true).put("existingOwnerDeviceBindingConfirmed",true).put("pendingRuntimeCommands",0);save(context,proof);
        SecretKey existing=EveAccountSessionStore.existingJournalKey();assertNull("Key remains non-exportable",existing.getEncoded());
        byte[] synthetic="RockstarOS existing-key transport preflight".getBytes(StandardCharsets.UTF_8);
        Cipher encrypt=Cipher.getInstance("AES/GCM/NoPadding");encrypt.init(Cipher.ENCRYPT_MODE,existing);
        byte[] sealed=encrypt.doFinal(synthetic);Cipher decrypt=Cipher.getInstance("AES/GCM/NoPadding");
        decrypt.init(Cipher.DECRYPT_MODE,existing,new GCMParameterSpec(128,encrypt.getIV()));assertArrayEquals(synthetic,decrypt.doFinal(sealed));
        try(EvePortableClaimJournal journal=EvePortableJournalKeys.open(context,account.origin,account.owner,device)){
            assertEquals("No pre-existing candidate claims",0,journal.records().length());
        }
        proof.put("existingKeystoreRoundtripConfirmed",true).put("boundJournalOpened",true);save(context,proof);
        JSONObject before=SkyLinuxBridge.request(context,new JSONObject().put("action","status"));
        JSONObject command=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-capabilities");
        JSONObject caps=SkyLinuxBridge.request(context,command);
        PixelPortableBridgeProtocol.validate(command,caps);
        JSONObject diagnostic=SkyLinuxBridge.diagnostics();assertTrue(diagnostic.getBoolean("authenticated"));assertTrue(diagnostic.getBoolean("portableRuntime"));
        JSONObject after=SkyLinuxBridge.request(context,new JSONObject().put("action","status"));
        for(String k:new String[]{"runs","models","agents"})assertEquals(k+" retained",canonical(before.getJSONArray(k)),canonical(after.getJSONArray(k)));
        assertEquals(26,after.getJSONArray("runs").length());assertEquals(2,after.getJSONArray("models").length());assertEquals(6,after.getJSONArray("agents").length());
        assertEquals("stopped",after.getString("phase"));
        List<String> afterAliases=Collections.list(keys.aliases());Collections.sort(afterAliases);assertEquals(aliases,afterAliases);
        proof.put("accepted",true).put("actualPrivateMutualTlsConfirmed",true).put("portableRuntimeAdvertised",true)
            .put("runtimeAbiConfirmed",true).put("keyAliasesUnchanged",true).put("jobsRetained",26).put("modelsRetained",2).put("agentsRetained",6)
            .put("linuxPhase",after.getString("phase"));save(context,proof);
    }
}
