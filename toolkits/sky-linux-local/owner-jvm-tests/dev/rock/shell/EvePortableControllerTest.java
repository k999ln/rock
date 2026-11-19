package dev.rock.shell;

import static org.junit.Assert.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;

public class EvePortableControllerTest {
    private JSONObject f,command;
    private Path root;
    private SecretKey key;
    private long now;
    private AtomicBoolean continuing;
    private FakeAccount account;
    private FakeBridge bridge;
    @Before public void setup()throws Exception{
        try(InputStream in=getClass().getResourceAsStream("/portable-command-fixture.json")){f=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));}
        command=new JSONObject(f.getJSONObject("command").toString());now=f.getLong("now");root=Files.createTempDirectory("portable-controller-").toRealPath();
        KeyGenerator k=KeyGenerator.getInstance("AES");k.init(256);key=k.generateKey();continuing=new AtomicBoolean(true);account=new FakeAccount();bridge=new FakeBridge();
    }
    @After public void cleanup()throws Exception{try(java.util.stream.Stream<Path> paths=Files.walk(root)){for(Path p:paths.sorted(java.util.Comparator.reverseOrder()).toArray(Path[]::new))Files.deleteIfExists(p);}}
    private EvePortableClaimJournal journal()throws Exception{return new EvePortableClaimJournal(root,"dev.rock.shell","https://avoado.si",f.getString("owner"),f.getString("device"),()->key);}
    private EvePortableController controller(EvePortableClaimJournal j)throws Exception{return new EvePortableController(account,bridge,j,f.getString("owner"),f.getString("device"),"a".repeat(64),continuing::get,()->now);}
    @Test public void temporaryLockDefersCancellationWithoutRerunningAndConfirmedRevocationStillStops()throws Exception{
        try(EvePortableClaimJournal j=journal()){
            bridge.running=true;bridge.stopDuringStart=true;
            EvePortableController suspended=new EvePortableController(account,bridge,j,f.getString("owner"),f.getString("device"),"a".repeat(64),continuing::get,()->now,()->false);
            reject(()->suspended.poll(new JSONObject()));assertEquals(1,bridge.starts);assertEquals(0,bridge.cancels);
            continuing.set(true);bridge.stopDuringStart=false;
            assertEquals("running",suspended.poll(new JSONObject()).getString("state"));assertEquals(1,bridge.starts);
            account.revokeOnInspect=true;reject(()->suspended.poll(null));assertEquals(1,bridge.cancels);
        }
    }
    private String id()throws Exception{return command.getJSONObject("request").getString("id");}
    private interface Checked{void run()throws Exception;}
    private void reject(Checked run)throws Exception{try{run.run();fail("must reject");}catch(Exception expected){}}
    private final class FakeAccount implements EvePortableController.Account {
        String state="runtime-pending",claim=null,failOnce="",badGrant="";boolean foreign=false,revokeOnInspect=false;
        JSONObject stored;int claims,authorizations,publishes,acks,presences,stopReceipts;boolean revokeAfterCompute=false,noCommands=false;
        public JSONObject inspect()throws Exception{
            if(revokeOnInspect)throw new EvePortableController.HttpFailure(401);
            JSONArray entries=new JSONArray();if(!noCommands&&!state.startsWith("runtime-stopped:")&&!state.startsWith("runtime-stop-finished:")&&!state.startsWith("runtime-done:")&&(!"runtime-pending".equals(state)||now<command.getJSONObject("request").getLong("deadline")))
                entries.put(new JSONObject().put("command",command).put("state",state).put("expiresAt",command.getJSONObject("request").getLong("deadline")));
            return new JSONObject().put("ownerUserId",foreign?"foreign-owner":f.getString("owner")).put("deviceId",f.getString("device")).put("commands",entries);
        }
        public JSONObject put(JSONObject body)throws Exception{
            String action=body.getString("action");JSONObject result;
            if("presence".equals(action)){presences++;return new JSONObject().put("ok",true).put("protocol",1);}
            if("stop-receipt".equals(action)){
                stopReceipts++;JSONObject value=body.getJSONObject("receipt");assertEquals(id(),value.getString("id"));assertEquals(claim,value.getString("claimId"));assertEquals(command.getString("requestSha256"),value.getString("requestSha256"));
                String r=value.getString("state"),ownerState="confirmed".equals(r)?"stop-confirmed":"finished".equals(r)?"stop-finished":"unknown".equals(r)?"stop-unknown":"stop-requested";
                state=("confirmed".equals(r)?"runtime-stopped:":"finished".equals(r)?"runtime-stop-finished:":"unknown".equals(r)?"runtime-stop-unknown:":"runtime-stop:")+claim;
                result=new JSONObject().put("ok",true).put("state",ownerState);
            }else if("claim".equals(action)){
                claims++;JSONObject value=body.getJSONObject("claim");assertEquals(id(),value.getString("id"));assertEquals(command.getString("requestSha256"),value.getString("requestSha256"));
                if(claim!=null)assertEquals(claim,value.getString("claimId"));claim=value.getString("claimId");state="runtime-claimed:"+claim;
                result=new JSONObject().put("claimId",claim).put("requestSha256",command.getString("requestSha256"));
            }else if("authorize".equals(action)){
                authorizations++;if(revokeAfterCompute&&authorizations==2)throw new EvePortableController.HttpFailure(401);assertEquals(claim,body.getString("claimId"));
                result=new JSONObject().put("owner",f.getString("owner")).put("jobId",id()).put("requestSha256",command.getString("requestSha256"))
                    .put("executorId","pixel-linux-gguf").put("permission","text.generate").put("maximumCostMinor",0).put("expiresAt",command.getJSONObject("request").getLong("deadline"));
                if(!badGrant.isEmpty())result.put(badGrant,"maximumCostMinor".equals(badGrant)?1:"tampered");
            }else if("report".equals(action)){
                publishes++;JSONObject value=body.getJSONObject("value"),report=value.getJSONObject("report");assertEquals(0,value.getLong("revision"));EvePortableCommands.report(report,command,claim);
                if(stored!=null)assertEquals(EvePortableCommands.canonical(stored),EvePortableCommands.canonical(report));stored=new JSONObject(report.toString());result=new JSONObject().put("revision",1);
            }else if("ack".equals(action)){
                acks++;assertNotNull(stored);assertEquals(claim,body.getString("claimId"));state="runtime-done:"+claim;result=new JSONObject().put("ok",true);
            }else throw new IOException("unsupported");
            if(action.equals(failOnce)){failOnce="";throw new IOException("response lost after commit");}return result;
        }
        public JSONObject read(String job)throws Exception{
            assertEquals(id(),job);if(stored==null)return null;
            return new JSONObject().put("execution",new JSONObject().put("id",id()).put("deviceId",f.getString("device"))
                .put("threadId",command.getJSONObject("request").getString("threadId")).put("request",command.getJSONObject("request"))
                .put("report",stored).put("revision",1).put("provenance","linked-device-report").put("externalToolSuccess",false));
        }
    }
    private final class FakeBridge implements EvePortableController.Bridge {
        int starts,cancels,reads,probes;boolean loseStart=false,startBeforeFailure=true,exists=false,stopDuringStart=false,oldAbi=false,wrongModel=false,running=false;
        JSONObject lastStart;int stopIntents;String stopStatus="stop_pending";boolean badStopBinding=false,badFence=false;
        public JSONObject request(JSONObject c)throws Exception{
            String action=c.getString("action");
            if("runtime-capabilities".equals(action)){probes++;return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","capabilities").put("protocol",oldAbi?0:1).put("scopedExecution",true)
                .put("worker",new JSONObject().put("schema","rockstaros.linux-text-capability/1").put("protocol",1).put("maximumOutputTokens",1024).put("maximumDeadlineMs",120000).put("platform","linux").put("architecture","aarch64"));}
            if("runtime-stop-capabilities".equals(action))return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","stop_capabilities").put("protocol",1).put("durableExactBinding",true).put("contentFreeStatus",true);
            if("runtime-stop-intent".equals(action)){stopIntents++;return response(c,"fenced").put("fenceDurable",true).put("stopConfirmed",false);}
            if("runtime-stop-status".equals(action)){
                JSONObject r=response(c,stopStatus).put("fenceDurable",!badFence).put("stopConfirmed","stop_confirmed".equals(stopStatus));
                if(badStopBinding)r.put("claimId","eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");return r;
            }
            if("runtime-start".equals(action)){
                starts++;lastStart=new JSONObject(c.toString());assertFalse(c.has("owner"));assertFalse(c.has("accessToken"));assertFalse(c.getJSONObject("authorization").has("owner"));
                assertEquals("a".repeat(64),c.getString("scopeSha256"));assertEquals(claim(),c.getString("claimId"));
                exists=!loseStart||startBeforeFailure;
                if(stopDuringStart)continuing.set(false);
                if(loseStart){loseStart=false;throw new IOException("start response lost");}
                return response(c,"starting");
            }
            if("runtime-cancel".equals(action)){cancels++;return response(c,"cancel_requested").put("stopConfirmed",false);}
            reads++;if(!exists)return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("state","not_found");
            JSONObject r=response(c,running?"running":"review").put("threadId",command.getJSONObject("request").getString("threadId"));
            if(running)return r;
            String text="合成の成果";JSONObject model=new JSONObject(command.getJSONObject("request").getJSONObject("model").toString());if(wrongModel)model.put("sha256","e".repeat(64));
            return r.put("text",text).put("outputSha256",EvePortableCommands.sha(text)).put("durationMs",20).put("model",model);
        }
        String claim(){return account.claim;}
        JSONObject response(JSONObject c,String state)throws Exception{return new JSONObject().put("schema","rockstaros.pixel-runtime-response/1").put("id",id()).put("claimId",c.getString("claimId")).put("requestSha256",command.getString("requestSha256")).put("state",state);}
    }
    @Test public void idleExecutorIsDiscoverableBeforeAnyJobExistsWithoutClaimOrInference()throws Exception{
        account.noCommands=true;
        try(EvePortableClaimJournal j=journal()){
            assertEquals("idle",controller(j).poll(new JSONObject()).getString("state"));
            assertEquals(1,account.presences);assertEquals(1,bridge.probes);assertEquals(0,j.records().length());
            assertEquals(0,account.claims);assertEquals(0,account.authorizations);assertEquals(0,bridge.starts);assertEquals(0,account.publishes);
            controller(j).poll(null);assertEquals(1,account.presences);assertEquals(1,bridge.probes);
        }
    }
    @Test public void idlePresenceStillRequiresCurrentIdentityAndCompatibleWorker()throws Exception{
        account.noCommands=true;account.foreign=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(0,bridge.probes);assertEquals(0,account.presences);assertEquals(0,j.records().length());}
        account.foreign=false;bridge.oldAbi=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(1,bridge.probes);assertEquals(0,account.presences);assertEquals(0,j.records().length());assertEquals(0,bridge.starts);}
    }
    @Test public void oneLoopSavesSameJobThenReopenDoesNotInferAgain()throws Exception{
        try(EvePortableClaimJournal j=journal()){
            assertEquals("review",controller(j).poll(new JSONObject()).getString("state"));assertEquals("acked",j.read(id()).getJSONObject("publication").getString("phase"));
            assertEquals(2,account.authorizations);assertEquals(1,account.publishes);assertEquals(1,bridge.starts);
        }
        try(EvePortableClaimJournal j=journal()){assertEquals("idle",controller(j).poll(null).getString("state"));assertEquals(1,bridge.starts);}
    }
    @Test public void lostClaimReplyUsesSameDurableClaimAndOnlyOneStart()throws Exception{
        account.failOnce="claim";String claim;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));claim=j.read(id()).getString("claimId");assertEquals("claim_unknown",j.read(id()).getString("state"));}
        try(EvePortableClaimJournal j=journal()){controller(j).poll(new JSONObject());assertEquals(claim,j.read(id()).getString("claimId"));assertEquals(1,account.claims);assertEquals(1,bridge.starts);}
    }
    @Test public void lostStartReplyReadsSameEngineRecordAndNeverStartsAgain()throws Exception{
        bridge.loseStart=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals("dispatch_unknown",j.read(id()).getString("state"));}
        try(EvePortableClaimJournal j=journal()){assertEquals("review",controller(j).poll(null).getString("state"));assertEquals(1,bridge.starts);}
    }
    @Test public void missingEngineRecordAfterUncertainSendIsNeverReplayPermission()throws Exception{
        bridge.loseStart=true;bridge.startBeforeFailure=false;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));}
        try(EvePortableClaimJournal j=journal()){assertEquals("unknown",controller(j).poll(null).getString("state"));assertEquals("unknown",controller(j).poll(new JSONObject()).getString("state"));assertEquals(1,bridge.starts);assertEquals(0,account.publishes);}
    }
    @Test public void reportResponseLostReconcilesWithoutLinuxAndWithoutDuplicatePublication()throws Exception{
        account.failOnce="report";
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals("prepared",j.read(id()).getJSONObject("publication").getString("phase"));}
        int reads=bridge.reads;
        try(EvePortableClaimJournal j=journal()){assertEquals("review",controller(j).poll(null).getString("state"));assertEquals(1,account.publishes);assertEquals(reads,bridge.reads);assertEquals(1,bridge.starts);}
    }
    @Test public void lostAckReplyReadsReportEvenWhenServerQueueNoLongerContainsCommand()throws Exception{
        account.failOnce="ack";
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals("confirmed",j.read(id()).getJSONObject("publication").getString("phase"));}
        try(EvePortableClaimJournal j=journal()){controller(j).poll(null);assertEquals("acked",j.read(id()).getJSONObject("publication").getString("phase"));assertEquals(2,account.acks);assertEquals(1,bridge.starts);}
    }
    @Test public void exactGrantRejectsForeignOwnerScopeCostAndDeadlineBeforeDispatch()throws Exception{
        for(String field:new String[]{"owner","jobId","executorId","permission","maximumCostMinor","expiresAt","requestSha256"}){
            account.badGrant=field;
            try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(0,bridge.starts);}
        }
    }
    @Test public void modelChangedByGuestIsNotPublishedAsRequestedModel()throws Exception{
        bridge.wrongModel=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(0,account.publishes);assertFalse(j.read(id()).has("publication"));}
    }
    @Test public void foreignIdentityAndOldAbiCannotClaim()throws Exception{
        account.foreign=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(0,j.records().length());}
        account.foreign=false;bridge.oldAbi=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(0,j.records().length());assertEquals(0,account.claims);}
    }
    @Test public void stopAfterSendCancelsOnlyOriginalScopeAndDoesNotPublish()throws Exception{
        bridge.stopDuringStart=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(1,bridge.cancels);assertEquals(0,account.publishes);assertEquals("dispatch_unknown",j.read(id()).getString("state"));}
    }
    @Test public void expiredRunningJobRequestsCancelAndSavesUnknownWithoutClaimingStop()throws Exception{
        bridge.running=true;
        try(EvePortableClaimJournal j=journal()){
            assertEquals("running",controller(j).poll(new JSONObject()).getString("state"));now+=120001;
            assertEquals("unknown",controller(j).poll(null).getString("state"));assertEquals(1,bridge.cancels);assertEquals("unknown",account.stored.getString("state"));assertEquals(1,bridge.starts);
        }
    }
    @Test public void serverRevocationBeforeAcceptingOutputRequestsScopedCancel()throws Exception{
        account.revokeAfterCompute=true;
        try(EvePortableClaimJournal j=journal()){reject(()->controller(j).poll(new JSONObject()));assertEquals(1,bridge.cancels);assertEquals(0,account.publishes);assertFalse(j.read(id()).has("publication"));}
    }
    @Test public void revocationAtNextInspectionCancelsPreviouslyDispatchedOwnedWork()throws Exception{
        bridge.running=true;
        try(EvePortableClaimJournal j=journal()){
            assertEquals("running",controller(j).poll(new JSONObject()).getString("state"));account.revokeOnInspect=true;
            reject(()->controller(j).poll(null));assertEquals(1,bridge.cancels);assertEquals(0,account.publishes);
        }
    }
    @Test public void orphanServerClaimNeverCreatesLocalJournalAndOfflineNewWorkWaits()throws Exception{
        account.state="runtime-claimed:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
        try(EvePortableClaimJournal j=journal()){assertEquals("unknown",controller(j).poll(new JSONObject()).getString("state"));assertEquals(0,j.records().length());assertEquals(0,bridge.starts);}
        account.state="runtime-pending";
        try(EvePortableClaimJournal j=journal()){assertEquals("waiting_for_linux",controller(j).poll(null).getString("state"));assertEquals(0,j.records().length());assertEquals(0,account.claims);}
        try(EvePortableClaimJournal j=journal()){
            j.prepare(command,now);String[] old={"claim_unknown","claimed","dispatch_unknown","dispatched","report_unknown","reported","acked"};
            for(int i=0;i<old.length;i++)j.advance(id(),i,old[i]);
            assertEquals("idle",controller(j).poll(new JSONObject()).getString("state"));assertEquals(0,bridge.starts);
        }
    }
    @Test public void changedReportOrPublicationCasCannotReplaceDurableResult()throws Exception{
        account.failOnce="report";
        try(EvePortableClaimJournal j=journal()){
            reject(()->controller(j).poll(new JSONObject()));JSONObject row=j.read(id()),report=row.getJSONObject("publication").getJSONObject("report");
            report.put("text","changed").put("outputSha256",EvePortableCommands.sha("changed"));
            reject(()->j.stageReport(id(),row.getLong("revision"),report));reject(()->j.publicationStep(id(),1,"acked"));reject(()->j.advance(id(),row.getLong("revision"),"unknown"));
        }
    }
    @Test public void ownerStopWaitsForActualReceiptAndNeverRepeatsInference()throws Exception{
        bridge.running=true;
        try(EvePortableClaimJournal j=journal()){
            controller(j).poll(new JSONObject());assertEquals(1,bridge.starts);account.state="runtime-stop:"+account.claim;
            assertEquals("stop-requested",controller(j).poll(null).getString("state"));assertEquals(1,bridge.starts);assertEquals(0,account.publishes);
            bridge.stopStatus="stop_unknown";assertEquals("stop-unknown",controller(j).poll(null).getString("state"));
            bridge.stopStatus="stop_confirmed";assertEquals("stop-confirmed",controller(j).poll(null).getString("state"));
            assertEquals(1,bridge.starts);assertEquals(3,account.stopReceipts);assertEquals(0,account.publishes);
            controller(j).poll(null);controller(j).poll(null);assertEquals(1,bridge.starts);
        }
    }
    @Test public void ownerStopRejectsForeignClaimOrMissingFenceBeforeAcknowledging()throws Exception{
        bridge.running=true;
        try(EvePortableClaimJournal j=journal()){
            controller(j).poll(new JSONObject());account.state="runtime-stop:"+account.claim;
            bridge.badStopBinding=true;reject(()->controller(j).poll(null));assertEquals(0,account.stopReceipts);
            bridge.badStopBinding=false;bridge.badFence=true;reject(()->controller(j).poll(null));assertEquals(0,account.stopReceipts);assertEquals(1,bridge.starts);
        }
    }
    @Test public void finishedStopStagesSameOutputBeforeReceiptAndRecoversLostReceiptWithoutInference()throws Exception{
        bridge.running=true;
        try(EvePortableClaimJournal j=journal()){
            controller(j).poll(new JSONObject());account.state="runtime-stop:"+account.claim;bridge.running=false;bridge.stopStatus="stop_finished";
            account.failOnce="stop-receipt";reject(()->controller(j).poll(null));assertTrue(j.read(id()).has("publication"));assertEquals(0,account.publishes);
        }
        try(EvePortableClaimJournal j=journal()){
            assertEquals("review",controller(j).poll(null).getString("state"));assertEquals(1,bridge.starts);assertEquals(1,account.publishes);
        }
    }
    @Test public void absentOrphanStopNeverClaimsActualTerminationOrCreatesNewWork()throws Exception{
        account.claim="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";account.state="runtime-stop:"+account.claim;bridge.stopStatus="stop_absent";
        try(EvePortableClaimJournal j=journal()){
            assertEquals("stop-unknown",controller(j).poll(null).getString("state"));assertEquals(0,j.records().length());assertEquals(0,bridge.starts);assertEquals(0,account.publishes);
        }
    }
    @Test public void stopBeforeDispatchUsesDurableFenceWithoutStartingWorker()throws Exception{
        try(EvePortableClaimJournal j=journal()){
            JSONObject row=j.prepare(command,now);account.claim=row.getString("claimId");j.advance(id(),0,"claim_unknown");j.advance(id(),1,"claimed");account.state="runtime-stop:"+account.claim;bridge.stopStatus="stop_absent";
            assertEquals("stop-confirmed",controller(j).poll(null).getString("state"));assertEquals(0,bridge.starts);assertEquals(1,bridge.stopIntents);assertEquals(0,account.publishes);
        }
    }

    @Test public void finishedStopAfterLostStartResponsePreservesSameOutputWithoutRepeatingStart()throws Exception{
        bridge.loseStart=true;bridge.running=true;
        try(EvePortableClaimJournal j=journal()){
            reject(()->controller(j).poll(new JSONObject()));assertEquals("dispatch_unknown",j.read(id()).getString("state"));
            account.state="runtime-stop:"+account.claim;bridge.running=false;bridge.stopStatus="stop_finished";
            assertEquals("review",controller(j).poll(null).getString("state"));assertEquals(1,bridge.starts);assertEquals(1,account.publishes);
            assertEquals("acked",j.read(id()).getJSONObject("publication").getString("phase"));
        }
    }

}
