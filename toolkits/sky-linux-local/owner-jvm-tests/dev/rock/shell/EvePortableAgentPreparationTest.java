package dev.rock.shell;
import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.IOException;

public class EvePortableAgentPreparationTest {
 static final String DEVICE="11111111-2222-4333-8444-555555555555",ID="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",AGENT="bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
 static class Fixture implements EvePortableAgentPreparation.Account,EvePortableAgentPreparation.Bridge,EvePortableAgentPreparation.Presence {
  final JSONObject command,request,agent,model;String state="agent-prepare-pending",viewOwner="owner",permission="agent.prepare";
  boolean live=true,registered=false,lost=false,wrongResponse=false,missingReadback=false,retireOnGrant=false;int starts=0,acks=0,grants=0,unknowns=0;long now=1000;
  Fixture()throws Exception{
   JSONObject recipe=new JSONObject().put("name","役割").put("instructions","本人の目的から文章を下書きする").put("modelId","fixture");
   String serialized="{\"name\":"+EvePortableCommands.quote(recipe.getString("name"))+",\"instructions\":"+EvePortableCommands.quote(recipe.getString("instructions"))+",\"modelId\":\"fixture\"}";
   agent=new JSONObject(recipe.toString()).put("id",AGENT).put("sha256",EvePortableCommands.sha(serialized));model=new JSONObject().put("id","fixture").put("scheme","gguf-sha256").put("sha256","c".repeat(64));
   request=new JSONObject().put("id",ID).put("threadId",ID).put("agent",agent).put("model",model).put("deadline",2000);
   command=new JSONObject().put("schema","rockstaros.agent-preparation-command/1").put("owner","owner").put("deviceId",DEVICE).put("request",request).put("requestSha256",EvePortableCommands.sha(EvePortableCommands.canonical(request)));
  }
  EvePortableAgentPreparation controller()throws Exception{return new EvePortableAgentPreparation(this,this,this,"owner",DEVICE,"a".repeat(64),()->live,()->now);}
  public JSONObject preparations()throws Exception{return new JSONObject().put("ownerUserId",viewOwner).put("deviceId",DEVICE).put("preparations",new JSONArray().put(new JSONObject().put("command",command).put("state",state).put("expiresAt",2000)));}
  public JSONObject read()throws Exception{return new JSONObject().put("phase","ready").put("host",new JSONObject().put("capabilities",new JSONObject().put("agent.prepare",true))).put("agents",new JSONArray(registered&&!missingReadback?"["+agent.toString()+"]":"[]")).put("models",new JSONArray().put(model)).put("preparedModels",new JSONArray().put("fixture"));}
  public JSONObject put(JSONObject body)throws Exception{
   String action=body.getString("action");
   if("presence".equals(action))return new JSONObject().put("ok",true).put("protocol",1);
   if("claim-agent-preparation".equals(action)){JSONObject claim=body.getJSONObject("claim");assertEquals(ID,claim.getString("claimId"));state="agent-prepare-claimed:"+ID;return new JSONObject().put("claimId",ID).put("requestSha256",command.getString("requestSha256"));}
   if("authorize-agent-preparation".equals(action)){grants++;if(retireOnGrant)live=false;return new JSONObject().put("owner","owner").put("preparationId",ID).put("requestSha256",command.getString("requestSha256")).put("permission",permission).put("maximumCostMinor",0).put("expiresAt",2000);}
   if("unknown-agent-preparation".equals(action)){unknowns++;return new JSONObject().put("id",ID).put("registered",JSONObject.NULL).put("state","unknown");}
   if("ack-agent-preparation".equals(action)){assertTrue(registered);assertFalse(missingReadback);acks++;return new JSONObject().put("id",ID).put("registered",true);}
   throw new IOException("unexpected fixture action");
  }
  public JSONObject request(JSONObject frame)throws Exception{
   if("runtime-agent-capabilities".equals(frame.getString("action")))return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","agent_capabilities").put("protocol",1).put("pinnedAgentPreparation",true).put("downloads",false);
   assertEquals("runtime-agent-prepare",frame.getString("action"));assertFalse(frame.toString().contains("Bearer"));assertFalse(frame.getJSONObject("authorization").has("owner"));starts++;registered=true;
   if(lost){lost=false;throw new IOException("lost response after registration");}
   return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","agent_prepared").put("id",ID).put("threadId",ID).put("claimId",wrongResponse?AGENT:ID).put("requestSha256",command.getString("requestSha256")).put("agent",agent).put("model",model);
  }
 }
 interface Throwing {void run()throws Exception;}
 static void refuses(Throwing call)throws Exception{try{call.run();fail("must reject");}catch(IOException|org.json.JSONException expected){}}
 @Test public void registersReadsFreshPresenceAndAcknowledgesWithoutStartingText()throws Exception{
  Fixture f=new Fixture();assertTrue(EvePortableAgentPreparation.supported(f));assertTrue(f.controller().poll());assertEquals(1,f.starts);assertEquals(1,f.acks);assertEquals(1,f.grants);
 }
 @Test public void lostRegistrationResponseReconcilesSameIdWithoutRegisteringAgain()throws Exception{
  Fixture f=new Fixture();f.lost=true;refuses(()->f.controller().poll());assertEquals(1,f.starts);assertEquals(0,f.acks);
  assertTrue(f.controller().poll());assertEquals(1,f.starts);assertEquals(1,f.acks);assertEquals(1,f.grants);
 }
 @Test public void foreignOwnerWrongGrantRetiredAccountAndBadCorrelationCannotAcknowledge()throws Exception{
  Fixture a=new Fixture();a.viewOwner="foreign";refuses(()->a.controller().poll());assertEquals(0,a.starts);
  Fixture b=new Fixture();b.permission="text.generate";refuses(()->b.controller().poll());assertEquals(0,b.starts);
  Fixture c=new Fixture();c.retireOnGrant=true;refuses(()->c.controller().poll());assertEquals(0,c.starts);
  Fixture d=new Fixture();d.wrongResponse=true;refuses(()->d.controller().poll());assertEquals(0,d.acks);
 }
 @Test public void absentReadbackAndExpiredPendingCannotClaimSuccess()throws Exception{
  Fixture a=new Fixture();a.missingReadback=true;refuses(()->a.controller().poll());assertEquals(1,a.starts);assertEquals(0,a.acks);
  Fixture b=new Fixture();b.now=2001;refuses(()->b.controller().poll());assertEquals(0,b.starts);assertEquals(0,b.grants);
 }
 @Test public void anAlreadyRegisteredClaimCanBeReadBackWithoutAnotherExpiredGrant()throws Exception{
  Fixture f=new Fixture();f.state="agent-prepare-claimed:"+ID;f.registered=true;f.now=2001;
  assertTrue(f.controller().poll());assertEquals(0,f.starts);assertEquals(0,f.grants);assertEquals(1,f.acks);
 }
 @Test public void expiredClaimWithoutReadbackBecomesUnknownWithoutAnotherRegistrationOrGrant()throws Exception{
  Fixture f=new Fixture();f.state="agent-prepare-claimed:"+ID;f.now=2001;
  assertFalse(f.controller().poll());assertEquals(0,f.starts);assertEquals(0,f.grants);assertEquals(0,f.acks);assertEquals(1,f.unknowns);
  Fixture g=new Fixture();g.state="agent-prepare-claimed:"+ID;g.now=2001;g.registered=true;g.missingReadback=true;
  assertFalse(g.controller().poll());assertEquals(0,g.starts);assertEquals(0,g.grants);assertEquals(0,g.acks);assertEquals(1,g.unknowns);
 }
}
