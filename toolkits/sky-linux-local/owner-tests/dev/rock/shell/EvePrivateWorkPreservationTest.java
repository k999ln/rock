package dev.rock.shell;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Read existing local data only; no account HTTP, execution, key creation or UI automation. */
@RunWith(AndroidJUnit4.class)
public final class EvePrivateWorkPreservationTest {
    private static void containsUnchanged(JSONArray original, JSONArray current, boolean runs) throws Exception {
        for (int i=0;i<original.length();i++) {
            JSONObject expected=original.getJSONObject(i);String id=runs?expected.getJSONObject("job").getString("id"):expected.getString("id");
            JSONObject found=null;
            for(int j=0;j<current.length();j++) {
                JSONObject item=current.getJSONObject(j);
                if(id.equals(runs?item.getJSONObject("job").getString("id"):item.getString("id")))found=item;
            }
            assertNotNull("Existing item must remain: "+id,found);
            assertEquals("Existing contents must remain: "+id,EvePortableCommands.canonical(expected),EvePortableCommands.canonical(found));
        }
    }
    @Test public void keepsOldWorkModelsRolesAndKeysAfterPrivateTrial() throws Exception {
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject before;
        try(InputStream in=c.openFileInput("pixel-vm-restart-before.json")) {
            before=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
        }
        JSONObject old=before.getJSONObject("snapshot"),now=SkyLinuxBridge.request(c,new JSONObject().put("action","status"));
        JSONArray original=old.getJSONArray("runs"),runs=now.getJSONArray("runs");
        JSONArray observedRuns=new JSONArray();for(int i=0;i<runs.length();i++){JSONObject run=runs.getJSONObject(i);observedRuns.put(new JSONObject().put("id",run.getJSONObject("job").getString("id")).put("status",run.getJSONObject("job").getString("status")).put("stop",run.opt("stop")).put("error",run.opt("error")));}
        JSONObject observation=new JSONObject().put("recordedAt",System.currentTimeMillis()).put("accepted",false).put("phase",now.getString("phase")).put("runs",observedRuns).put("bridge",SkyLinuxBridge.diagnostics());
        try(java.io.OutputStream out=c.openFileOutput("eve-private-preservation.json",Context.MODE_PRIVATE)){out.write(observation.toString(2).getBytes(StandardCharsets.UTF_8));}
        assertEquals(28,original.length());
        containsUnchanged(original,runs,true);
        containsUnchanged(old.getJSONArray("agents"),now.getJSONArray("agents"),false);
        assertEquals(EvePortableCommands.canonical(old.getJSONArray("models")),EvePortableCommands.canonical(now.getJSONArray("models")));
        int active=0;for(int i=0;i<runs.length();i++)if(!EvePrivatePreview.finished(runs.getJSONObject(i).getJSONObject("job").getString("status")))active++;
        assertEquals("All trial work must be terminal before cleanup",0,active);
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        ArrayList<String> aliases=Collections.list(keys.aliases());Collections.sort(aliases);
        assertEquals(EvePortableCommands.canonical(before.getJSONArray("keyAliases")),EvePortableCommands.canonical(new JSONArray(aliases)));
        JSONObject proof=new JSONObject().put("schema","rockstaros.private-eve-preservation/1").put("recordedAt",System.currentTimeMillis())
            .put("oldJobsPreserved",28).put("jobs",runs.length()).put("oldAgentsPreserved",old.getJSONArray("agents").length())
            .put("agents",now.getJSONArray("agents").length()).put("models",now.getJSONArray("models").length()).put("activeJobs",active)
            .put("keyAliasesUnchanged",true).put("normalSessionFilePresent",new java.io.File(c.getNoBackupFilesDir(),"account/eve-account-session-v2.bin").isFile())
            .put("privateSessionActive",new EvePortableAccountBinding(c).active()).put("accepted",true);
        try(java.io.OutputStream out=c.openFileOutput("eve-private-preservation.json",Context.MODE_PRIVATE)) {
            out.write(proof.toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }
}
