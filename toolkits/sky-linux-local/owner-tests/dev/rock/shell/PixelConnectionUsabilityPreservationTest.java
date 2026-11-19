package dev.rock.shell;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.file.Files;import java.io.File;import java.security.*;import java.util.*;
import org.json.*;import org.junit.Test;import org.junit.runner.RunWith;import static org.junit.Assert.*;
/** Read-only product snapshot. Writes only its own private test evidence. */
@RunWith(AndroidJUnit4.class)
public final class PixelConnectionUsabilityPreservationTest {
 private Context context(){assertEquals("physical",InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));return InstrumentationRegistry.getInstrumentation().getTargetContext();}
 private String canonical(Object value)throws Exception{
  if(value instanceof JSONObject){JSONObject o=(JSONObject)value;List<String> keys=new ArrayList<>();o.keys().forEachRemaining(keys::add);Collections.sort(keys);List<String> result=new ArrayList<>();for(String k:keys)result.add(JSONObject.quote(k)+":"+canonical(o.get(k)));return "{"+String.join(",",result)+"}";}
  if(value instanceof JSONArray){JSONArray a=(JSONArray)value;List<String> out=new ArrayList<>();for(int i=0;i<a.length();i++)out.add(canonical(a.get(i)));return "["+String.join(",",out)+"]";}
  return value==JSONObject.NULL?"null":value instanceof String?JSONObject.quote((String)value):String.valueOf(value);
 }
 private String sha(byte[] bytes)throws Exception{StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))out.append(String.format(Locale.ROOT,"%02x",b));return out.toString();}
 private JSONObject snapshot(Context c)throws Exception{
  JSONObject state=SkyLinuxBridge.request(c,new JSONObject().put("action","status"));JSONObject result=new JSONObject();
  for(String k:new String[]{"runs","models","agents"}){result.put(k+"Sha256",sha(canonical(state.get(k)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));result.put(k+"Count",state.getJSONArray(k).length());}
  int active=0;JSONArray runs=state.getJSONArray("runs");for(int i=0;i<runs.length();i++){JSONObject run=runs.getJSONObject(i);String status=run.getJSONObject("job").getString("status");if("active".equals(status)||Arrays.asList("requested","unconfirmed").contains(run.optString("stop")))active++;}
  assertNotEquals("Do not interrupt AI preparation","preparing",state.optString("phase"));result.put("activeJobs",active);assertEquals("Do not update over active work",0,active);
  KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);List<String> aliases=Collections.list(keys.aliases());Collections.sort(aliases);result.put("keysSha256",sha(String.join("\n",aliases).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  for(String path:new String[]{"no_backup/account/eve-account-session-v2.bin","files/pixel-linux-bridge-peer.json","files/pixel-linux-bridge-server.pem","shared_prefs/eve_account_sync.xml","no_backup/private-eve-preview/session-v2.bin","no_backup/portable-stops/handles.json"}){
   File file=new File(c.getApplicationInfo().dataDir,path);assertTrue(path,file.isFile());result.put(path,sha(Files.readAllBytes(file.toPath())));
  }
  return result;
 }
 @Test public void inspectExistingCacheCold()throws Exception {
  Context c=context();assertTrue(EvePixelHostService.idle());assertFalse("Must inspect a fresh process",SkyLinuxBridge.diagnostics().has("stage"));
  Map<String,String> protectedBefore=new TreeMap<>();
  for(String path:new String[]{"no_backup/account/eve-account-session-v2.bin","files/pixel-linux-bridge-peer.json","files/pixel-linux-bridge-server.pem","no_backup/private-eve-preview/session-v2.bin","no_backup/portable-stops/handles.json"})protectedBefore.put(path,sha(Files.readAllBytes(new File(c.getApplicationInfo().dataDir,path).toPath())));
  JSONObject inventory=EvePortableAccountSync.cachedModels(c,"inventory",null);
  assertEquals(300000,inventory.getLong("expiresAtElapsed")-inventory.getLong("observedElapsed"));
  assertEquals(2,inventory.getJSONArray("inventory").length());int names=0;
  for(int i=0;i<inventory.getJSONArray("inventory").length();i++){JSONObject row=inventory.getJSONArray("inventory").getJSONObject(i);assertEquals("verified",row.getString("state"));names+=row.getJSONArray("agentNames").length();}
  assertTrue("Show the existing agents' model association",names>0);
  for(Map.Entry<String,String> entry:protectedBefore.entrySet())assertEquals(entry.getKey(),entry.getValue(),sha(Files.readAllBytes(new File(c.getApplicationInfo().dataDir,entry.getKey()).toPath())));
  JSONObject proof=new JSONObject().put("coldExistingBridge",true).put("inventoryCount",2).put("agentNamesCount",names).put("inventoryLifetimeMs",300000).put("protectedHashesUnchanged",true).put("inference",0);
  Files.write(new File(c.getFilesDir(),"pixel-connection-usability-cold.json").toPath(),proof.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
 }
 @Test public void captureBefore()throws Exception{Context c=context();File file=new File(c.getFilesDir(),"pixel-connection-usability-before.json");assertFalse("Never overwrite baseline",file.exists());JSONObject before=snapshot(c);Files.write(file.toPath(),before.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 @Test public void verifyAfter()throws Exception{Context c=context();JSONObject before=new JSONObject(new String(Files.readAllBytes(new File(c.getFilesDir(),"pixel-connection-usability-before.json").toPath()),java.nio.charset.StandardCharsets.UTF_8));JSONObject after=snapshot(c);assertEquals(canonical(before),canonical(after));after.put("preserved",true).put("newInference",0).put("newKeys",0);Files.write(new File(c.getFilesDir(),"pixel-connection-usability-after.json").toPath(),after.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
}
