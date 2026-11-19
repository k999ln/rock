package dev.rock.shell;

import java.io.IOException;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** One bounded account-sync tick. The existing Linux manager remains the only executor. */
final class EvePortableController {
    interface Account {
        JSONObject inspect() throws Exception;
        JSONObject put(JSONObject body) throws Exception;
        JSONObject read(String id) throws Exception; // null ONLY for authenticated HTTP 404
    }
    interface Bridge { JSONObject request(JSONObject command) throws Exception; }
    static final class Stopped extends IOException { Stopped(){super("PORTABLE_SYNC_STOPPED");} }
    static class HttpFailure extends IOException {
        final int status;
        HttpFailure(int status){super("PORTABLE_ACCOUNT_HTTP_"+status);this.status=status;}
    }
    private final Account account;
    private final Bridge bridge;
    private final EvePortableClaimJournal journal;
    private final String owner, device, scope;
    private final BooleanSupplier continuing;
    private final BooleanSupplier cancelWhenStopped;
    private final LongSupplier clock;
    EvePortableController(Account account,Bridge bridge,EvePortableClaimJournal journal,String owner,String device,
            String scope,BooleanSupplier continuing,LongSupplier clock)throws Exception{
        this(account,bridge,journal,owner,device,scope,continuing,clock,()->true);
    }
    EvePortableController(Account account,Bridge bridge,EvePortableClaimJournal journal,String owner,String device,
            String scope,BooleanSupplier continuing,LongSupplier clock,BooleanSupplier cancelWhenStopped)throws Exception{
        EvePortableCommands.require(EvePortableCommands.owner(owner)&&EvePortableCommands.id(device)&&scope.matches("[a-f0-9]{64}"));
        EvePortableCommands.require(cancelWhenStopped!=null);
        this.account=account;this.bridge=bridge;this.journal=journal;this.owner=owner;this.device=device;
        this.scope=scope;this.continuing=continuing;this.clock=clock;this.cancelWhenStopped=cancelWhenStopped;
    }
    private void live()throws Exception{if(!continuing.getAsBoolean())throw new Stopped();}
    private JSONObject put(JSONObject body)throws Exception{live();JSONObject r=account.put(body);live();return r;}
    private JSONObject wire(JSONObject body)throws Exception{
        live();JSONObject r=bridge.request(body);live();PixelPortableBridgeProtocol.validate(body,r);return r;
    }
    private JSONObject frame(JSONObject row,String action)throws Exception{
        JSONObject c=row.getJSONObject("command");return new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1")
            .put("action",action).put("id",row.getString("id")).put("scopeSha256",scope).put("claimId",row.getString("claimId"))
            .put("requestSha256",c.getString("requestSha256"));
    }
    private JSONObject inspect()throws Exception{
        live();JSONObject value=account.inspect();live();EvePortableCommands.fields(value,"ownerUserId","deviceId","commands");
        EvePortableCommands.require(owner.equals(EvePortableCommands.string(value,"ownerUserId"))&&device.equals(EvePortableCommands.string(value,"deviceId"))&&value.getJSONArray("commands").length()<=8);
        return value;
    }
    private JSONObject authorize(JSONObject row)throws Exception{
        JSONObject c=row.getJSONObject("command"),r=c.getJSONObject("request");
        JSONObject value=put(new JSONObject().put("action","authorize").put("id",row.getString("id")).put("claimId",row.getString("claimId")));
        EvePortableCommands.fields(value,"owner","jobId","requestSha256","executorId","permission","maximumCostMinor","expiresAt");
        EvePortableCommands.require(owner.equals(EvePortableCommands.string(value,"owner"))&&row.getString("id").equals(EvePortableCommands.string(value,"jobId"))
            &&c.getString("requestSha256").equals(EvePortableCommands.string(value,"requestSha256"))&&"pixel-linux-gguf".equals(EvePortableCommands.string(value,"executorId"))
            &&"text.generate".equals(EvePortableCommands.string(value,"permission"))&&EvePortableCommands.integer(value,"maximumCostMinor")==0
            &&EvePortableCommands.integer(value,"expiresAt")==r.getLong("deadline")&&clock.getAsLong()<r.getLong("deadline"));return value;
    }
    private JSONObject saved(JSONObject row)throws Exception{
        live();JSONObject raw=account.read(row.getString("id"));live();if(raw==null)return null;
        EvePortableCommands.fields(raw,"execution");JSONObject v=raw.getJSONObject("execution"),c=row.getJSONObject("command");
        EvePortableCommands.require(row.getString("id").equals(EvePortableCommands.string(v,"id"))&&device.equals(EvePortableCommands.string(v,"deviceId"))
            &&c.getJSONObject("request").getString("threadId").equals(EvePortableCommands.string(v,"threadId"))
            &&EvePortableCommands.canonical(c.getJSONObject("request")).equals(EvePortableCommands.canonical(v.getJSONObject("request")))
            &&EvePortableCommands.integer(v,"revision")>0&&Boolean.FALSE.equals(v.opt("externalToolSuccess"))
            &&"linked-device-report".equals(EvePortableCommands.string(v,"provenance")));
        EvePortableCommands.report(v.getJSONObject("report"),c,row.getString("claimId"));return v;
    }
    private JSONObject publish(JSONObject row)throws Exception{
        JSONObject publication=row.getJSONObject("publication"),report=publication.getJSONObject("report"),remote=saved(row);
        if(remote==null){
            // Idempotent server report, always the same locally durable bytes. No inference retry.
            put(new JSONObject().put("action","report").put("value",new JSONObject().put("report",report).put("revision",0)));
            remote=saved(row);
        }
        EvePortableCommands.require(remote!=null&&EvePortableCommands.canonical(report).equals(EvePortableCommands.canonical(remote.getJSONObject("report"))));
        if("prepared".equals(publication.getString("phase")))row=journal.publicationStep(row.getString("id"),0,"confirmed");
        JSONObject ack=put(new JSONObject().put("action","ack").put("id",row.getString("id")).put("claimId",row.getString("claimId")));
        EvePortableCommands.fields(ack,"ok");EvePortableCommands.require(Boolean.TRUE.equals(ack.get("ok")));
        if(!"acked".equals(row.getJSONObject("publication").getString("phase")))journal.publicationStep(row.getString("id"),1,"acked");
        return new JSONObject().put("state",report.getString("state")).put("id",row.getString("id")).put("saved",true);
    }
    private JSONObject unknown(JSONObject row,String error)throws Exception{
        if(!"unknown".equals(row.getString("state")))row=journal.advance(row.getString("id"),row.getLong("revision"),"unknown");
        JSONObject c=row.getJSONObject("command"),report=new JSONObject().put("schema","rockstaros.runtime-report/1").put("id",row.getString("id"))
            .put("requestSha256",c.getString("requestSha256")).put("claimId",row.getString("claimId")).put("state","unknown")
            .put("text",JSONObject.NULL).put("outputSha256",JSONObject.NULL).put("durationMs",JSONObject.NULL).put("errorCode",error).put("model",c.getJSONObject("request").getJSONObject("model"));
        return publish(journal.stageReport(row.getString("id"),row.getLong("revision"),report));
    }
    private JSONObject stopRemote(JSONObject entry)throws Exception{
        JSONObject c=entry.getJSONObject("command");String id=c.getJSONObject("request").getString("id");
        String claim=entry.getString("state").substring(entry.getString("state").indexOf(':')+1);
        EvePortableCommands.require(EvePortableCommands.id(claim));
        JSONObject row=journal.read(id);
        if(row!=null)EvePortableCommands.require(claim.equals(row.getString("claimId"))
            &&EvePortableCommands.canonical(c).equals(EvePortableCommands.canonical(row.getJSONObject("command"))));
        JSONObject frame=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("id",id)
            .put("claimId",claim).put("requestSha256",c.getString("requestSha256")).put("scopeSha256",scope);
        wire(new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-stop-capabilities"));
        wire(new JSONObject(frame.toString()).put("action","runtime-stop-intent"));
        JSONObject result=wire(new JSONObject(frame.toString()).put("action","runtime-stop-status"));
        EvePortableCommands.require(Boolean.TRUE.equals(result.opt("fenceDurable")));
        String status=result.getString("state"),receipt="pending";
        if("stop_confirmed".equals(status))receipt="confirmed";
        else if("stop_finished".equals(status))receipt="finished";
        else if("stop_unknown".equals(status))receipt="unknown";
        else if("stop_absent".equals(status)){
            // Absence alone cannot prove an old/foreign-scope worker stopped.
            // A durable local pre-dispatch record proves no start was sent.
            receipt=row!=null&&java.util.Arrays.asList("prepared","claim_unknown","claimed").contains(row.getString("state"))?"confirmed":"unknown";
        }
        if("finished".equals(receipt)&&row!=null&&!row.has("publication")&&java.util.Arrays.asList("dispatch_unknown","dispatched").contains(row.getString("state"))) {
            JSONObject output=wire(frame(row,"runtime-read"));
            if("review".equals(output.getString("state"))){
                if("dispatch_unknown".equals(row.getString("state")))row=journal.advance(id,row.getLong("revision"),"dispatched");
                row=stageReview(row,output);
            }
        }
        JSONObject ack=put(new JSONObject().put("action","stop-receipt").put("receipt",new JSONObject().put("id",id)
            .put("claimId",claim).put("requestSha256",c.getString("requestSha256")).put("state",receipt)));
        EvePortableCommands.fields(ack,"ok","state");EvePortableCommands.require(Boolean.TRUE.equals(ack.opt("ok")));
        String expected="confirmed".equals(receipt)?"stop-confirmed":"finished".equals(receipt)?"stop-finished":"unknown".equals(receipt)?"stop-unknown":"stop-requested";
        EvePortableCommands.require(expected.equals(ack.getString("state")));
        if("finished".equals(receipt)&&row!=null&&row.has("publication")
                &&"review".equals(row.getJSONObject("publication").getJSONObject("report").getString("state")))return publish(row);
        if(java.util.Arrays.asList("confirmed","finished").contains(receipt)&&row!=null&&!row.has("publication")&&!"unknown".equals(row.getString("state")))
            journal.advance(id,row.getLong("revision"),"unknown"); // Stop receipt is separate from result/quality state.
        return new JSONObject().put("state",expected).put("id",id).put("saved",true);
    }
    private JSONObject stageReview(JSONObject row,JSONObject result)throws Exception{
        JSONObject c=row.getJSONObject("command"),request=c.getJSONObject("request");
        EvePortableCommands.require(request.getString("threadId").equals(result.getString("threadId"))
            &&EvePortableCommands.canonical(request.getJSONObject("model")).equals(EvePortableCommands.canonical(result.getJSONObject("model"))));
        JSONObject report=new JSONObject().put("schema","rockstaros.runtime-report/1").put("id",row.getString("id")).put("requestSha256",c.getString("requestSha256"))
            .put("claimId",row.getString("claimId")).put("state","review").put("text",result.getString("text")).put("outputSha256",result.getString("outputSha256"))
            .put("durationMs",result.get("durationMs")).put("model",result.getJSONObject("model")).put("errorCode",JSONObject.NULL);
        return journal.stageReport(row.getString("id"),row.getLong("revision"),report);
    }
    private JSONObject perform(JSONObject row,String remoteState,JSONObject presence)throws Exception{
        String id=row.getString("id");JSONObject c=row.getJSONObject("command"),request=c.getJSONObject("request");
        EvePortableCommands.verify(c,owner,device,clock.getAsLong(),false);
        if(row.has("publication"))return publish(row);
        JSONObject remote=saved(row);
        if(remote!=null)return publish(journal.stageReport(id,row.getLong("revision"),remote.getJSONObject("report")));
        String expected="runtime-claimed:"+row.getString("claimId"),state=row.getString("state");
        if(remoteState==null||(!"runtime-pending".equals(remoteState)&&!expected.equals(remoteState))){
            if(!"unknown".equals(state))journal.advance(id,row.getLong("revision"),"unknown");
            return new JSONObject().put("state","unknown").put("id",id).put("saved",false);
        }
        if(java.util.Arrays.asList("prepared","claim_unknown","claimed").contains(state)){
            if(presence==null)return new JSONObject().put("state","waiting_for_linux").put("id",id).put("saved",false);
            ready(presence);
        }
        if("prepared".equals(state)){
            EvePortableCommands.require("runtime-pending".equals(remoteState));
            EvePortableCommands.verify(c,owner,device,clock.getAsLong(),true);
            row=journal.advance(id,0,"claim_unknown");state="claim_unknown";
        }
        if("claim_unknown".equals(state)){
            if(!expected.equals(remoteState)){
                EvePortableCommands.require("runtime-pending".equals(remoteState));
                JSONObject claim=put(new JSONObject().put("action","claim").put("claim",new JSONObject().put("id",id).put("claimId",row.getString("claimId")).put("requestSha256",c.getString("requestSha256"))));
                EvePortableCommands.fields(claim,"claimId","requestSha256");
                EvePortableCommands.require(row.getString("claimId").equals(EvePortableCommands.string(claim,"claimId"))&&c.getString("requestSha256").equals(EvePortableCommands.string(claim,"requestSha256")));
            }
            row=journal.advance(id,1,"claimed");state="claimed";
        }else EvePortableCommands.require(expected.equals(remoteState));
        if("claimed".equals(state)){
            JSONObject grant=authorize(row);
            JSONObject start=frame(row,"runtime-start");start.remove("id");start.put("request",request);
            JSONObject permitted=new JSONObject(EvePortableCommands.canonical(grant));permitted.remove("owner");permitted.put("scopeSha256",scope);start.put("authorization",permitted);
            EvePortableCommands.require(EvePortableCommands.canonical(start).getBytes(java.nio.charset.StandardCharsets.UTF_8).length+1<=24000);
            EvePortableCommands.verify(c,owner,device,clock.getAsLong(),true);row=journal.advance(id,2,"dispatch_unknown");
            wire(start);row=journal.advance(id,3,"dispatched");state="dispatched";
        }
        if("dispatch_unknown".equals(state)){
            JSONObject result=wire(frame(row,"runtime-read"));
            if("not_found".equals(result.getString("state")))return new JSONObject().put("state","unknown").put("id",id).put("saved",false);
            row=journal.advance(id,3,"dispatched");state="dispatched";
        }
        if("unknown".equals(state))return unknown(row,"PREVIOUS_OUTCOME_UNKNOWN");
        EvePortableCommands.require("dispatched".equals(state));JSONObject result=wire(frame(row,"runtime-read"));
        String resultState=result.getString("state");
        if("starting".equals(resultState)||"running".equals(resultState)){
            if(clock.getAsLong()>=request.getLong("deadline")){
                wire(frame(row,"runtime-cancel"));return unknown(row,"EXECUTION_DEADLINE_OUTCOME_UNKNOWN");
            }
            return new JSONObject().put("state","running").put("id",id).put("saved",false);
        }
        if(!"review".equals(resultState))return unknown(row,"EXECUTOR_OUTCOME_UNKNOWN");
        EvePortableCommands.require(request.getString("threadId").equals(result.getString("threadId"))
            &&EvePortableCommands.canonical(request.getJSONObject("model")).equals(EvePortableCommands.canonical(result.getJSONObject("model"))));
        authorize(row); // Current server permission again before accepting/publishing any result.
        return publish(stageReview(row,result));
    }
    private void ready(JSONObject presence)throws Exception{
        wire(new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-capabilities"));
        JSONObject accepted=put(new JSONObject().put("action","presence").put("presence",presence));
        EvePortableCommands.fields(accepted,"ok","protocol");EvePortableCommands.require(Boolean.TRUE.equals(accepted.get("ok"))&&EvePortableCommands.integer(accepted,"protocol")==1);
    }
    private JSONObject tick(JSONObject presence)throws Exception{
        JSONObject identity=inspect();JSONArray entries=identity.getJSONArray("commands"),rows=journal.records();
        java.util.LinkedHashMap<String,JSONObject> remote=new java.util.LinkedHashMap<>();
        for(int i=0;i<entries.length();i++){
            JSONObject e=entries.getJSONObject(i);EvePortableCommands.fields(e,"command","state","expiresAt");JSONObject c=e.getJSONObject("command");
            EvePortableCommands.verify(c,owner,device,clock.getAsLong(),false);EvePortableCommands.require(EvePortableCommands.integer(e,"expiresAt")==c.getJSONObject("request").getLong("deadline"));
            String state=EvePortableCommands.string(e,"state");EvePortableCommands.require("runtime-pending".equals(state)||state.matches("runtime-(claimed|stop|stop-unknown):[a-f0-9-]{36}"));
            String id=c.getJSONObject("request").getString("id");EvePortableCommands.require(!remote.containsKey(id));remote.put(id,e);
        }
        for(JSONObject e:remote.values())if(e.getString("state").startsWith("runtime-stop:")||e.getString("state").startsWith("runtime-stop-unknown:"))return stopRemote(e);
        JSONObject selected=null;String remoteState=null;
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);if(row.has("publication")&&"acked".equals(row.getJSONObject("publication").getString("phase")))continue;
            if("acked".equals(row.getString("state")))continue; // Earlier journal API already confirmed this record.
            JSONObject e=remote.get(row.getString("id"));
            if(e!=null)EvePortableCommands.require(EvePortableCommands.canonical(e.getJSONObject("command")).equals(EvePortableCommands.canonical(row.getJSONObject("command"))));
            String state=e==null?null:e.getString("state"),own="runtime-claimed:"+row.getString("claimId");
            if("unknown".equals(row.getString("state"))&&!row.has("publication")&&!own.equals(state))continue;
            selected=row;remoteState=state;break;
        }
        if(selected==null&&presence!=null)for(JSONObject e:remote.values()){
            JSONObject c=e.getJSONObject("command");String id=c.getJSONObject("request").getString("id");
            if(journal.read(id)==null&&"runtime-pending".equals(e.getString("state"))&&clock.getAsLong()<e.getLong("expiresAt")){
                // Probe ABI and permission-compatible metadata before even persisting a new claim.
                ready(presence);selected=journal.prepare(c,clock.getAsLong());remoteState=e.getString("state");break;
            }
        }
        if(selected==null){
            for(JSONObject e:remote.values())if(e.getString("state").startsWith("runtime-claimed:")&&journal.read(e.getJSONObject("command").getJSONObject("request").getString("id"))==null)
                return new JSONObject().put("state","unknown").put("saved",false);
            // The owner must discover an idle executor before submitting its first job.
            // Advertise only after the same authenticated identity and ABI checks;
            // no claim, execution journal entry or inference is created here.
            if(presence!=null)ready(presence);
            return new JSONObject().put("state",presence==null&&!remote.isEmpty()?"waiting_for_linux":"idle");
        }
        return perform(selected,remoteState,presence);
    }
    void cancelOwned()throws Exception{
        JSONArray rows=journal.records();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);
            if(!row.has("publication")&&java.util.Arrays.asList("dispatch_unknown","dispatched").contains(row.getString("state")))
                try{bridge.request(frame(row,"runtime-cancel"));}catch(Exception ignored){}
        }
    }
    JSONObject poll(JSONObject presence)throws Exception{
        try{return tick(presence);}catch(Exception failure){
            try{
                if(failure instanceof HttpFailure&&java.util.Arrays.asList(401,403,409).contains(((HttpFailure)failure).status)
                        ||failure instanceof Stopped&&cancelWhenStopped.getAsBoolean())cancelOwned();
            }catch(Exception ignored){}
            throw failure;
        }
    }
}
