package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Read-only owner runtime probe. Never exports credentials, enrolls keys or starts inference. */
@RunWith(AndroidJUnit4.class)
public final class EveOneLoopPreflightTest {
 @Test public void inspectExistingRuntime() throws Exception {
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
  JSONObject proof=new JSONObject().put("schema","rockstaros.eve-one-loop-preflight/1").put("recordedAt",System.currentTimeMillis());
  boolean unlocked=!c.getSystemService(KeyguardManager.class).isDeviceLocked();
  proof.put("unlocked",unlocked).put("existingKeysAndPairing",PixelHostPrerequisites.available(c)).put("accountLinked",EveAccountSync.linked(c));
  try {
   assertTrue("Owner unlock required",unlocked);assertTrue("Existing pairing required",PixelHostPrerequisites.available(c));assertTrue("Existing account required",EveAccountSync.linked(c));
   JSONObject s=SkyLinuxBridge.request(c,new JSONObject().put("action","status"));
   proof.put("phase",s.getString("phase")).put("jobs",s.getJSONArray("runs").length()).put("agents",s.getJSONArray("agents").length()).put("models",s.getJSONArray("models").length()).put("preparedModels",s.getJSONArray("preparedModels").length());
   int active=0;for(int i=0;i<s.getJSONArray("runs").length();i++)if("active".equals(s.getJSONArray("runs").getJSONObject(i).getJSONObject("job").getString("status")))active++;
   proof.put("activeJobs",active);
   try {JSONObject capability=SkyLinuxBridge.request(c,new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-agent-capabilities"));proof.put("agentPreparation",capability.optBoolean("pinnedAgentPreparation",false));}
   catch(Exception unsupported){proof.put("agentPreparation",false).put("capabilityError",unsupported.getClass().getSimpleName());}
   proof.put("inspected",true);
  } finally {
   proof.put("bridge",SkyLinuxBridge.diagnostics());
   try(FileOutputStream out=c.openFileOutput("eve-one-loop-preflight.json",Context.MODE_PRIVATE)){out.write(proof.toString(2).getBytes(StandardCharsets.UTF_8));}
  }
 }
}
