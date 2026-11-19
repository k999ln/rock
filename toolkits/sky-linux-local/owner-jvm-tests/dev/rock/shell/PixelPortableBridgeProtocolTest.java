package dev.rock.shell;
import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
public class PixelPortableBridgeProtocolTest {
 private final String id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",claim="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",hash="c".repeat(64);
 private JSONObject command()throws Exception{return new JSONObject().put("action","runtime-read").put("id",id).put("claimId",claim).put("requestSha256",hash);}
 private JSONObject response(String state)throws Exception{return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state",state).put("id",id).put("claimId",claim).put("requestSha256",hash);}
 private void reject(JSONObject c,JSONObject r)throws Exception{try{PixelPortableBridgeProtocol.validate(c,r);fail("reject");}catch(java.io.IOException|org.json.JSONException expected){}}
 @Test public void validatesCorrelatedStatesAndKeepsUnknown()throws Exception{
  PixelPortableBridgeProtocol.validate(command(),response("starting"));PixelPortableBridgeProtocol.validate(command(),response("unknown").put("text",JSONObject.NULL).put("stopConfirmed",false));
  PixelPortableBridgeProtocol.validate(command(),new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","not_found"));
  reject(command(),response("starting").put("id",claim));reject(command(),response("starting").put("claimId",id));reject(command(),response("completed"));
 }
 @Test public void refusesSecretAndUnboundFields()throws Exception{
  reject(command(),response("starting").put("accessToken","do-not-forward"));reject(command(),response("unknown").put("text","not a result"));reject(command(),response("starting").put("schema","sky.private-linux-deployment/1"));
 }
 @Test public void checksOutputHashAndNeverAcceptsEngineStopFromCancelRequest()throws Exception{
  String text="fixture";StringBuilder sha=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)))sha.append(String.format(java.util.Locale.ROOT,"%02x",b));
  JSONObject r=response("review").put("threadId",id).put("text",text).put("durationMs",1).put("outputSha256",sha.toString()).put("model",new JSONObject().put("id","fixture").put("scheme","gguf-sha256").put("sha256",hash));
  PixelPortableBridgeProtocol.validate(command(),new JSONObject(r.toString()).put("text","lone\ud800").put("outputSha256","9557acdc40c984769a00a22b26ed1d9ff073d4a1c23b66ef7218bd6f57571ed5"));
  PixelPortableBridgeProtocol.validate(command(),r);reject(command(),new JSONObject(r.toString()).put("text","changed"));reject(command(),new JSONObject(r.toString()).put("durationMs",1.5));
  JSONObject cancel=command().put("action","runtime-cancel");PixelPortableBridgeProtocol.validate(cancel,response("cancel_requested").put("stopConfirmed",false));reject(cancel,response("cancel_requested").put("stopConfirmed",true));
 }
 @Test public void requiresExactCapabilityAdvertisement()throws Exception{
  assertTrue(PixelPortableBridgeProtocol.advertised(new JSONObject().put("capabilities",new org.json.JSONArray().put("portable-runtime/1"))));
  assertFalse(PixelPortableBridgeProtocol.advertised(new JSONObject().put("capabilities",new org.json.JSONArray().put("prefix portable-runtime/1"))));
  assertFalse(PixelPortableBridgeProtocol.advertised(new JSONObject().put("capabilities","portable-runtime/1")));
 }
 @Test public void validatesCapabilityTypesAndRejectsUnknownFields()throws Exception{
  JSONObject c=new JSONObject().put("action","runtime-capabilities");
  JSONObject worker=new JSONObject().put("schema","rockstaros.linux-text-capability/1").put("protocol",1).put("maximumOutputTokens",1024).put("maximumDeadlineMs",120000).put("platform","linux").put("architecture","aarch64");
  JSONObject r=new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","capabilities").put("protocol",1).put("scopedExecution",true).put("worker",worker);
  PixelPortableBridgeProtocol.validate(c,r);reject(c,new JSONObject(r.toString()).put("protocol",1.5));reject(c,new JSONObject(r.toString()).put("scopedExecution","true"));reject(c,new JSONObject(r.toString()).put("accessToken","not accepted"));
 }
 @Test public void negotiatesDurableStopSeparatelyFromTheExistingV1Response()throws Exception{
  JSONObject c=new JSONObject().put("action","runtime-stop-capabilities");
  JSONObject r=new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","stop_capabilities").put("protocol",1).put("durableExactBinding",true).put("contentFreeStatus",true);
  assertTrue(PixelPortableBridgeProtocol.isRuntime(c));PixelPortableBridgeProtocol.validate(c,r);
  reject(c,new JSONObject(r.toString()).put("protocol",1.5));reject(c,new JSONObject(r.toString()).put("durableExactBinding","true"));
  reject(c,new JSONObject(r.toString()).put("accessToken","not accepted"));
 }
 @Test public void durableFenceIsBoundAndNeverAnEngineStopReceipt()throws Exception{
  JSONObject c=command().put("action","runtime-stop-intent"),r=response("fenced").put("fenceDurable",true).put("stopConfirmed",false);
  assertTrue(PixelPortableBridgeProtocol.isRuntime(c));PixelPortableBridgeProtocol.validate(c,r);
  reject(c,new JSONObject(r.toString()).put("stopConfirmed",true));reject(c,new JSONObject(r.toString()).put("fenceDurable","true"));
  reject(c,new JSONObject(r.toString()).put("claimId",id));reject(c,new JSONObject(r.toString()).put("state","cancel_requested"));
  reject(c,new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","not_found"));
 }
 @Test public void agentPreparationRequiresExactCorrelatedRecipeAndSeparateCapability()throws Exception{
  JSONObject cap=new JSONObject().put("action","runtime-agent-capabilities");
  JSONObject advertised=new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","agent_capabilities").put("protocol",1).put("pinnedAgentPreparation",true).put("downloads",false);
  assertTrue(PixelPortableBridgeProtocol.isRuntime(cap));PixelPortableBridgeProtocol.validate(cap,advertised);
  reject(cap,new JSONObject(advertised.toString()).put("downloads",true));reject(cap,new JSONObject(advertised.toString()).put("protocol",1.5));
  String recipe="{\"name\":\"role\",\"instructions\":\"draft\",\"modelId\":\"fixture\"}";
  StringBuilder digest=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(recipe.getBytes(StandardCharsets.UTF_8)))digest.append(String.format(java.util.Locale.ROOT,"%02x",b));
  JSONObject agent=new JSONObject(recipe).put("id",claim).put("sha256",digest.toString()),model=new JSONObject().put("id","fixture").put("scheme","gguf-sha256").put("sha256",hash);
  JSONObject request=new JSONObject().put("id",id).put("threadId",id).put("agent",agent).put("model",model);
  JSONObject c=command().put("action","runtime-agent-prepare").put("request",request),r=response("agent_prepared").put("threadId",id).put("agent",agent).put("model",model);
  PixelPortableBridgeProtocol.validate(c,r);
  reject(c,new JSONObject(r.toString()).put("threadId",claim));reject(c,new JSONObject(r.toString()).put("claimId",id));
  reject(c,new JSONObject(r.toString()).put("agent",new JSONObject(agent.toString()).put("instructions","changed")));
  reject(c,new JSONObject(r.toString()).put("model",new JSONObject(model.toString()).put("sha256","d".repeat(64))));
  reject(c,new JSONObject(r.toString()).put("accessToken","forbidden"));reject(c,new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","not_found"));
 }
}
