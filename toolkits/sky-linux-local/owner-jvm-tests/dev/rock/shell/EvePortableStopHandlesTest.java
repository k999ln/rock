package dev.rock.shell;

import static org.junit.Assert.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class EvePortableStopHandlesTest {
    private Path root;
    private final String first="a".repeat(64),second="b".repeat(64);
    @Before public void setup()throws Exception{root=Files.createTempDirectory("portable-stops-").toRealPath();}
    @After public void cleanup()throws Exception{try(java.util.stream.Stream<Path> paths=Files.walk(root)){for(Path p:paths.sorted(java.util.Comparator.reverseOrder()).toArray(Path[]::new))Files.deleteIfExists(p);}}
    private JSONObject start()throws Exception{return new JSONObject().put("action","runtime-start")
        .put("request",new JSONObject().put("id",UUID.randomUUID().toString()).put("input","PRIVATE_TEST_TEXT_NOT_FOR_STOP_STORE"))
        .put("accessToken","PRIVATE_TEST_TOKEN_NOT_FOR_STOP_STORE").put("scopeSha256","c".repeat(64))
        .put("claimId",UUID.randomUUID().toString()).put("requestSha256","d".repeat(64));}
    private final class Bridge implements EvePortableStopHandles.Bridge {
        final List<JSONObject> sent=new ArrayList<>();String state="stop_absent";boolean fenced=true,injectText=false;
        public JSONObject request(JSONObject command)throws Exception{
            sent.add(new JSONObject(command.toString()));String action=command.getString("action");
            JSONObject value=new JSONObject().put("schema","rockstaros.pixel-runtime-response/1");
            if("runtime-stop-capabilities".equals(action))return value.put("state","stop_capabilities").put("protocol",1).put("durableExactBinding",true).put("contentFreeStatus",true);
            for(String name:new String[]{"id","claimId","requestSha256"})value.put(name,command.getString(name));
            if("runtime-stop-intent".equals(action))return value.put("state","fenced").put("fenceDurable",true).put("stopConfirmed",false);
            assertEquals("runtime-stop-status",action);value.put("state",state).put("fenceDurable",fenced).put("stopConfirmed","stop_confirmed".equals(state));
            if(injectText)value.put("text","MUST_NOT_ENTER_CANCELLATION");return value;
        }
    }
    @Test public void survivesAccountKeyLossAndReopenWithoutReadingAnyKeyOrContent()throws Exception{
        EvePortableStopHandles original=new EvePortableStopHandles(root);original.arm(start(),first);
        String body=new String(Files.readAllBytes(root.resolve("handles.json")),java.nio.charset.StandardCharsets.UTF_8);assertFalse(body.contains("PRIVATE_TEST_TEXT"));assertFalse(body.contains("PRIVATE_TEST_TOKEN"));
        EvePortableStopHandles reopened=new EvePortableStopHandles(root);
        assertEquals(first,reopened.requestActive());assertTrue(reopened.pending());
        Bridge bridge=new Bridge();assertEquals(0,reopened.cancelRequested(bridge,1,first));assertFalse(new EvePortableStopHandles(root).pending());
        assertEquals(3,bridge.sent.size());for(JSONObject command:bridge.sent)assertFalse(command.toString().contains("PRIVATE_TEST_"));
    }
    @Test public void lateOldSessionCancellationCannotStopTheNewAccount()throws Exception{
        EvePortableStopHandles stop=new EvePortableStopHandles(root);JSONObject old=start(),current=start();stop.arm(old,first);stop.arm(current,second);
        assertEquals(second,stop.activeSession());stop.requestSession(first);Bridge bridge=new Bridge();assertEquals(0,stop.cancelRequested(bridge,1,first));
        for(JSONObject sent:bridge.sent)if(sent.has("id"))assertEquals(old.getJSONObject("request").getString("id"),sent.getString("id"));
        assertEquals(second,stop.activeSession());assertFalse(stop.pending(second));assertTrue(new String(Files.readAllBytes(root.resolve("handles.json")),java.nio.charset.StandardCharsets.UTF_8).contains(current.getJSONObject("request").getString("id")));
        stop.requestSession(first);assertFalse(stop.pending());assertEquals(second,stop.requestActive());assertTrue(stop.pending(second));
    }
    @Test public void aRequestedStopBlocksNewDispatchUntilStatusIsConfirmed()throws Exception{
        EvePortableStopHandles stop=new EvePortableStopHandles(root);stop.arm(start(),first);stop.requestSession(first);
        try{stop.arm(start(),second);fail("new start must wait");}catch(java.io.IOException expected){}
        Bridge bridge=new Bridge();bridge.state="stop_pending";assertEquals(1,stop.cancelRequested(bridge,1,first));assertTrue(stop.pending());
        bridge.state="stop_confirmed";assertEquals(0,stop.cancelRequested(bridge,1,first));stop.arm(start(),second);assertEquals(second,stop.activeSession());
    }
    @Test public void missingFenceOrUnexpectedContentCannotRetireAHandle()throws Exception{
        EvePortableStopHandles stop=new EvePortableStopHandles(root);stop.arm(start(),first);stop.requestSession(first);Bridge bridge=new Bridge();
        bridge.fenced=false;assertEquals(1,stop.cancelRequested(bridge,1,first));assertTrue(stop.pending());bridge.fenced=true;bridge.injectText=true;
        try{stop.cancelRequested(bridge,1,first);fail("content rejected");}catch(java.io.IOException expected){}assertTrue(stop.pending());
    }
    @Test public void corruptOrSymlinkedMetadataNeverPermitsStartingAnotherJob()throws Exception{
        EvePortableStopHandles stop=new EvePortableStopHandles(root);stop.arm(start(),first);Path file=root.resolve("handles.json");byte[] body=Files.readAllBytes(file);
        Files.write(file,"{".getBytes(java.nio.charset.StandardCharsets.UTF_8));try{stop.arm(start(),second);fail("corrupt store rejected");}catch(org.json.JSONException|java.io.IOException expected){}
        Path target=root.resolve("outside");Files.write(target,body);Files.delete(file);Files.createSymbolicLink(file,target);
        try{stop.arm(start(),second);fail("symlink rejected");}catch(java.io.IOException expected){}assertArrayEquals(body,Files.readAllBytes(target));
    }
    @Test public void actualReadIsBoundedAndMalformedUtf8CannotBecomeMetadata()throws Exception{
        EvePortableStopHandles stop=new EvePortableStopHandles(root);stop.arm(start(),first);Path file=root.resolve("handles.json");
        byte[] original=Files.readAllBytes(file),exact=java.util.Arrays.copyOf(original,100000);
        java.util.Arrays.fill(exact,original.length,exact.length,(byte)' ');Files.write(file,exact);
        assertEquals(first,new EvePortableStopHandles(root).activeSession());
        Files.write(file,java.util.Arrays.copyOf(exact,100001));
        try{new EvePortableStopHandles(root).activeSession();fail("oversized file rejected");}catch(java.io.IOException expected){}
        byte[] invalid=java.util.Arrays.copyOf(original,original.length+2);invalid[original.length]=(byte)0xc3;invalid[original.length+1]=(byte)0x28;
        Files.write(file,invalid);
        try{new EvePortableStopHandles(root).activeSession();fail("invalid UTF-8 rejected");}catch(java.io.IOException expected){}
        assertArrayEquals(invalid,Files.readAllBytes(file));
        Files.write(file,original);assertEquals(first,new EvePortableStopHandles(root).activeSession());
    }
    @Test public void transientLockIsNotRevocationButConfirmedServerRejectionStillStopsTheCapturedSession(){
        assertFalse(EvePortableStopHandles.requiresStop(true,false,false,0,true));
        assertFalse(EvePortableStopHandles.requiresStop(true,false,true,0,false));
        assertFalse(EvePortableStopHandles.requiresStop(false,true,false,0,false));
        assertTrue(EvePortableStopHandles.requiresStop(false,false,false,0,false));
        assertTrue(EvePortableStopHandles.requiresStop(false,true,true,0,false));
        assertTrue(EvePortableStopHandles.requiresStop(false,true,false,0,true));
        for(int status:new int[]{401,403,409})assertTrue(EvePortableStopHandles.requiresStop(true,true,false,status,false));
    }
    @Test public void remoteStatusRetiresOnlyConfirmedOrFinishedExactHandle()throws Exception{
        for(String state:new String[]{"stop_absent","stop_pending","stop_unknown","stop_confirmed","stop_finished"}){
            Path directory=root.resolve(state);EvePortableStopHandles handles=new EvePortableStopHandles(directory);
            JSONObject start=start();handles.arm(start,first);handles.requestSession(first);
            JSONObject frame=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-stop-status").put("id",start.getJSONObject("request").getString("id"));
            for(String field:new String[]{"scopeSha256","claimId","requestSha256"})frame.put(field,start.getString(field));
            Bridge bridge=new Bridge();bridge.state=state;handles.observe(frame,bridge.request(frame));
            assertEquals(!java.util.Arrays.asList("stop_confirmed","stop_finished").contains(state),handles.pending(first));
        }
    }

}
