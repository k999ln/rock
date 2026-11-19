package dev.rock.shell;

import java.io.IOException;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** One registration per existing sync tick. Registration cannot start inference.
 * Exact agent IDs make lost responses repeatable without a second work ledger. */
final class EvePortableAgentPreparation {
    interface Account {JSONObject preparations()throws Exception;JSONObject put(JSONObject body)throws Exception;}
    interface Bridge {JSONObject request(JSONObject body)throws Exception;}
    interface Presence {JSONObject read()throws Exception;}
    private final Account account;private final Bridge bridge;private final Presence presence;
    private final String owner,device,scope;private final BooleanSupplier continuing;private final LongSupplier clock;
    EvePortableAgentPreparation(Account account,Bridge bridge,Presence presence,String owner,String device,String scope,BooleanSupplier continuing,LongSupplier clock)throws Exception{
        EvePortableCommands.require(EvePortableCommands.owner(owner)&&EvePortableCommands.id(device)&&scope.matches("[a-f0-9]{64}"));
        this.account=account;this.bridge=bridge;this.presence=presence;this.owner=owner;this.device=device;this.scope=scope;this.continuing=continuing;this.clock=clock;
    }
    private void live()throws Exception{if(!continuing.getAsBoolean())throw new EvePortableController.Stopped();}
    static boolean supported(Bridge bridge)throws Exception{
        JSONObject c=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-agent-capabilities");
        try{PixelPortableBridgeProtocol.validate(c,bridge.request(c));return true;}
        catch(EvePortableController.Stopped stopped){throw stopped;}
        catch(IOException unavailable){return false;}
    }
    private JSONObject put(JSONObject body)throws Exception{live();JSONObject r=account.put(body);live();return r;}
    private JSONObject fresh()throws Exception{
        live();JSONObject p=presence.read();live();EvePortableCommands.require(p!=null&&"ready".equals(p.getString("phase"))&&Boolean.TRUE.equals(p.getJSONObject("host").getJSONObject("capabilities").opt("agent.prepare")));
        put(new JSONObject().put("action","presence").put("presence",p));return p;
    }
    private boolean prepared(JSONObject p,JSONObject r)throws Exception{
        JSONObject agent=r.getJSONObject("agent"),model=r.getJSONObject("model");JSONArray agents=p.getJSONArray("agents"),models=p.getJSONArray("models"),prepared=p.getJSONArray("preparedModels");
        EvePortableCommands.require(agents.length()<=32&&models.length()<=8&&prepared.length()<=8);
        boolean pin=false,ready=false;for(int i=0;i<models.length();i++){JSONObject m=models.getJSONObject(i);if(model.getString("id").equals(m.getString("id")))pin=model.getString("sha256").equals(m.getString("sha256"))&&model.getString("scheme").equals(m.getString("scheme"));}
        for(int i=0;i<prepared.length();i++)if(model.getString("id").equals(prepared.getString(i)))ready=true;
        EvePortableCommands.require(pin&&ready);
        for(int i=0;i<agents.length();i++){JSONObject a=agents.getJSONObject(i);if(agent.getString("id").equals(a.getString("id"))){EvePortableCommands.require(EvePortableCommands.canonical(a).equals(EvePortableCommands.canonical(agent)));return true;}}
        return false;
    }
    boolean poll()throws Exception{
        live();JSONObject view=account.preparations();live();
        EvePortableCommands.require(owner.equals(EvePortableCommands.string(view,"ownerUserId"))&&device.equals(EvePortableCommands.string(view,"deviceId")));
        // Installed older servers return the accepted execution shape.
        if(!view.has("preparations")){EvePortableCommands.fields(view,"ownerUserId","deviceId","commands");return false;}
        EvePortableCommands.fields(view,"ownerUserId","deviceId","preparations");JSONArray rows=view.getJSONArray("preparations");EvePortableCommands.require(rows.length()<=4);if(rows.length()==0)return false;
        JSONObject row=rows.getJSONObject(0);EvePortableCommands.fields(row,"command","state","expiresAt");JSONObject c=row.getJSONObject("command");
        EvePortableCommands.preparation(c,owner,device,clock.getAsLong(),false);JSONObject r=c.getJSONObject("request");
        EvePortableCommands.require(EvePortableCommands.integer(row,"expiresAt")==r.getLong("deadline"));
        String id=r.getString("id"),claim=id,state=EvePortableCommands.string(row,"state");
        EvePortableCommands.require("agent-prepare-pending".equals(state)||("agent-prepare-claimed:"+claim).equals(state));
        if("agent-prepare-pending".equals(state)){
            EvePortableCommands.preparation(c,owner,device,clock.getAsLong(),true);
            JSONObject claimed=put(new JSONObject().put("action","claim-agent-preparation").put("claim",new JSONObject().put("id",id).put("claimId",claim).put("requestSha256",c.getString("requestSha256"))));
            EvePortableCommands.fields(claimed,"claimId","requestSha256");EvePortableCommands.require(claim.equals(claimed.getString("claimId"))&&c.getString("requestSha256").equals(claimed.getString("requestSha256")));
        }
        boolean expired=clock.getAsLong()>=r.getLong("deadline"),ready=false;JSONObject p=null;
        try{p=fresh();ready=prepared(p,r);}
        catch(EvePortableController.Stopped stopped){throw stopped;}
        catch(IOException|org.json.JSONException unavailable){if(!expired)throw unavailable;}
        if(expired&&!ready){
            JSONObject unknown=put(new JSONObject().put("action","unknown-agent-preparation").put("receipt",new JSONObject().put("id",id).put("claimId",claim).put("requestSha256",c.getString("requestSha256"))));
            EvePortableCommands.fields(unknown,"id","registered","state");EvePortableCommands.require(id.equals(unknown.getString("id"))&&unknown.isNull("registered")&&"unknown".equals(unknown.getString("state")));return false;
        }
        if(!ready){
            EvePortableCommands.preparation(c,owner,device,clock.getAsLong(),true);
            JSONObject a=put(new JSONObject().put("action","authorize-agent-preparation").put("id",id).put("claimId",claim));
            EvePortableCommands.fields(a,"owner","preparationId","requestSha256","permission","maximumCostMinor","expiresAt");
            EvePortableCommands.require(owner.equals(a.getString("owner"))&&id.equals(a.getString("preparationId"))&&c.getString("requestSha256").equals(a.getString("requestSha256"))&&"agent.prepare".equals(a.getString("permission"))&&EvePortableCommands.integer(a,"maximumCostMinor")==0&&EvePortableCommands.integer(a,"expiresAt")==r.getLong("deadline"));
            JSONObject grant=new JSONObject(a.toString());grant.remove("owner");grant.put("scopeSha256",scope);
            JSONObject frame=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-agent-prepare").put("request",r).put("scopeSha256",scope).put("claimId",claim).put("requestSha256",c.getString("requestSha256")).put("authorization",grant);
            live();EvePortableCommands.preparation(c,owner,device,clock.getAsLong(),true);JSONObject result=bridge.request(frame);live();PixelPortableBridgeProtocol.validate(frame,result);
            p=fresh();EvePortableCommands.require(prepared(p,r));
        }
        JSONObject ack=put(new JSONObject().put("action","ack-agent-preparation").put("receipt",new JSONObject().put("id",id).put("claimId",claim).put("requestSha256",c.getString("requestSha256")).put("agent",r.getJSONObject("agent")).put("model",r.getJSONObject("model"))));
        EvePortableCommands.fields(ack,"id","registered");EvePortableCommands.require(id.equals(ack.getString("id"))&&Boolean.TRUE.equals(ack.opt("registered")));return true;
    }
}
