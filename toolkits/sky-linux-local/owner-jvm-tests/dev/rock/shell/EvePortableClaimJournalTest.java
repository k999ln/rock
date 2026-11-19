package dev.rock.shell;

import static org.junit.Assert.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class EvePortableClaimJournalTest {
    private JSONObject fixture;
    private Path root;
    private SecretKey key;
    @Before public void setup() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/portable-command-fixture.json")) {
            assertNotNull(in); fixture = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
        root = Files.createTempDirectory("portable-journal-").toRealPath();
        KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256); key = generator.generateKey();
    }
    @After public void cleanup() throws Exception {
        try (java.util.stream.Stream<Path> paths = Files.walk(root)) {
            for (Path p : paths.sorted(java.util.Comparator.reverseOrder()).toArray(Path[]::new)) Files.deleteIfExists(p);
        }
    }
    private JSONObject command() throws Exception { return new JSONObject(fixture.getJSONObject("command").toString()); }
    private String owner() throws Exception { return fixture.getString("owner"); }
    private String device() throws Exception { return fixture.getString("device"); }
    private String id() throws Exception { return command().getJSONObject("request").getString("id"); }
    private long now() throws Exception { return fixture.getLong("now"); }
    private EvePortableClaimJournal open() throws Exception { return open("dev.rock.shell", "https://avoado.si", owner(), device()); }
    private EvePortableClaimJournal open(String pkg, String origin, String owner, String device) throws Exception {
        return new EvePortableClaimJournal(root, pkg, origin, owner, device, () -> key);
    }
    private Path ciphertext() throws Exception {
        try (java.util.stream.Stream<Path> paths = Files.list(root)) { return paths.filter(p -> p.toString().endsWith(".bin")).findFirst().orElseThrow(); }
    }
    private void reject(Checked run) throws Exception { try { run.run(); fail("must reject"); } catch (Exception expected) { } }
    private interface Checked { void run() throws Exception; }
    private void pin(JSONObject command) throws Exception {
        JSONObject r = command.getJSONObject("request"), a = r.getJSONObject("agent");
        String recipe = "{\"name\":" + EvePortableCommands.quote(a.getString("name")) + ",\"instructions\":" + EvePortableCommands.quote(a.getString("instructions")) + ",\"modelId\":" + EvePortableCommands.quote(a.getString("modelId")) + "}";
        a.put("sha256", EvePortableCommands.sha(recipe)); command.put("requestSha256", EvePortableCommands.sha(EvePortableCommands.canonical(r)));
    }
    @Test public void matchesJavascriptCanonicalAndAgentHashesIncludingUnicode() throws Exception {
        EvePortableCommands.verify(command(), owner(), device(), now(), true);
        JSONArray reports=fixture.getJSONArray("reports");
        for(int i=0;i<reports.length();i++)EvePortableCommands.report(reports.getJSONObject(i),command(),reports.getJSONObject(i).getString("claimId"));
        assertFalse(EvePortableCommands.nonblank("\u00a0\ufeff\u3000"));
        JSONArray vectors = fixture.getJSONArray("vectors");
        for (int i=0; i<vectors.length(); i++) {
            JSONObject v = vectors.getJSONObject(i); String actual = EvePortableCommands.canonical(v.get("value"));
            assertEquals(v.getString("canonical"), actual); assertEquals(v.getString("sha256"), EvePortableCommands.sha(actual));
        }
    }
    @Test public void refusesTypesOverflowPinsFieldsControlsAndInvalidDeadline() throws Exception {
        for (Object n : new Object[]{Long.MIN_VALUE, Long.MAX_VALUE, 9007199254740992L, 1.0, "1", true})
            reject(() -> EvePortableCommands.integer(new JSONObject().put("v", n), "v"));
        for (String field : new String[]{"owner", "deviceId", "requestSha256", "executorId", "displayInput"}) {
            JSONObject bad = command().put(field, 123); reject(() -> EvePortableCommands.verify(bad, owner(), device(), now(), true));
        }
        final JSONObject extra = command().put("accessToken", "must-not-store"); reject(() -> EvePortableCommands.verify(extra, owner(), device(), now(), true));
        JSONObject bad = command(); bad.getJSONObject("request").getJSONObject("agent").put("instructions", "changed"); final JSONObject tampered=bad;
        reject(() -> EvePortableCommands.verify(tampered, owner(), device(), now(), true));
        for (String value : new String[]{"bad\u0001", " ", "x".repeat(1201)}) {
            JSONObject c=command(); c.getJSONObject("request").getJSONObject("agent").put("instructions",value); pin(c);
            reject(() -> EvePortableCommands.verify(c,owner(),device(),now(),true));
        }
        JSONObject c=command(); c.getJSONObject("request").getJSONObject("model").put("id","unsafe..name"); c.getJSONObject("request").getJSONObject("agent").put("modelId","unsafe..name"); pin(c);
        reject(() -> EvePortableCommands.verify(c,owner(),device(),now(),true));
        reject(() -> EvePortableCommands.verify(command(),owner(),device(),now()+120000,true));
        reject(() -> EvePortableCommands.verify(command(),owner(),device(),now()-1,true));
    }
    @Test public void persistsSameClaimAcrossReopenAndExpiryWithoutGrantOrInference() throws Exception {
        JSONObject saved;
        try (EvePortableClaimJournal j=open()) { saved=j.prepare(command(),now()); saved.put("claimId","mutated-copy"); }
        byte[] bytes=Files.readAllBytes(ciphertext());
        String envelope=new String(bytes, StandardCharsets.UTF_8);
        assertFalse(envelope.contains(owner())); assertFalse(envelope.contains("合成の依頼")); assertFalse(envelope.contains("rock_session_"));
        try (EvePortableClaimJournal j=open()) {
            JSONObject again=j.prepare(command(),now()+600000); assertEquals("prepared",again.getString("state")); assertNotEquals("mutated-copy",again.getString("claimId"));
            assertArrayEquals(bytes,Files.readAllBytes(ciphertext()));
            JSONObject changed=command(); changed.getJSONObject("request").put("input","other"); pin(changed);
            reject(() -> j.prepare(changed,now())); assertEquals(again.toString(),j.read(id()).toString());
        }
    }
    @Test public void casAndStateMachineNeverPermitBlindRedispatch() throws Exception {
        String[] path={"claim_unknown","claimed","dispatch_unknown","dispatched","report_unknown","reported","acked"};
        try (EvePortableClaimJournal j=open()) {
            j.prepare(command(),now()); reject(() -> j.advance(id(),0,"dispatched"));
            for(int i=0;i<path.length;i++){final int rev=i;reject(() -> j.advance(id(),rev+1,path[rev]));JSONObject row=j.advance(id(),i,path[i]);assertEquals(i+1,row.getLong("revision"));}
            reject(() -> j.advance(id(),7,"prepared")); reject(() -> j.advance(id(),7,"unknown"));
        }
        try(EvePortableClaimJournal j=open()){assertEquals("acked",j.read(id()).getString("state"));}
    }
    @Test public void unknownIsPreservedAfterRestartAndNotAReplayPermission() throws Exception {
        try(EvePortableClaimJournal j=open()){j.prepare(command(),now());j.advance(id(),0,"claim_unknown");j.advance(id(),1,"unknown");}
        try(EvePortableClaimJournal j=open()){
            assertEquals("unknown",j.prepare(command(),now()+600000).getString("state"));
            reject(() -> j.advance(id(),2,"prepared"));reject(() -> j.advance(id(),2,"claimed"));reject(() -> j.advance(id(),2,"unknown"));
        }
    }
    @Test public void rejectsConcurrentInstancesAndAllowsReopenAfterClose() throws Exception {
        try(EvePortableClaimJournal j=open()){j.prepare(command(),now());reject(this::open);}
        try(EvePortableClaimJournal j=open()){assertNotNull(j.read(id()));}
    }
    @Test public void corruptedOrWrongKeyCiphertextIsPreserved() throws Exception {
        try(EvePortableClaimJournal j=open()){j.prepare(command(),now());}
        Path file=ciphertext();byte[] original=Files.readAllBytes(file);
        KeyGenerator generator=KeyGenerator.getInstance("AES");generator.init(256);SecretKey wrong=generator.generateKey();
        reject(() -> new EvePortableClaimJournal(root,"dev.rock.shell","https://avoado.si",owner(),device(),() -> wrong));
        assertArrayEquals(original,Files.readAllBytes(file));
        JSONObject box=new JSONObject(new String(original,StandardCharsets.UTF_8));byte[] encrypted=java.util.Base64.getDecoder().decode(box.getString("ciphertext"));encrypted[0]^=1;
        Files.write(file,box.put("ciphertext",java.util.Base64.getEncoder().encodeToString(encrypted)).toString().getBytes(StandardCharsets.UTF_8));byte[] bad=Files.readAllBytes(file);
        reject(this::open);assertArrayEquals(bad,Files.readAllBytes(file));
    }
    @Test public void bindsCiphertextToPackageOriginOwnerAndDevice() throws Exception {
        try(EvePortableClaimJournal j=open()){j.prepare(command(),now());}
        byte[] original=Files.readAllBytes(ciphertext());
        reject(() -> open("dev.other","https://avoado.si",owner(),device()));
        for(String[] swap:new String[][]{{"https://other.example",owner(),device()},{"https://avoado.si","another-owner",device()},{"https://avoado.si",owner(),"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}}){
            Path target=root.resolve(EvePortableCommands.sha(swap[0]+"\0"+swap[1]+"\0"+swap[2])+".bin");Files.write(target,original);Files.setPosixFilePermissions(target,PosixFilePermissions.fromString("rw-------"));
            reject(() -> open("dev.rock.shell",swap[0],swap[1],swap[2]));assertArrayEquals(original,Files.readAllBytes(target));
        }
    }
    @Test public void rejectsNoncanonicalOriginsAndPrivatePathViolations() throws Exception {
        for(String origin:new String[]{"http://avoado.si","https://avoado.si/","https://avoado.si:443","https://u@avoado.si","https://avoado.si?x=1","https://avoado.si#x","https://AVOADO.si","https://avoado.si:0"})
            reject(() -> open("dev.rock.shell",origin,owner(),device()));
        Path real=Files.createDirectory(root.resolve("real")),link=root.resolve("link");Files.createSymbolicLink(link,real);
        reject(() -> new EvePortableClaimJournal(link,"dev.rock.shell","https://avoado.si",owner(),device(),()->key));
        Files.setPosixFilePermissions(root,PosixFilePermissions.fromString("rwxr-xr-x"));reject(this::open);Files.setPosixFilePermissions(root,PosixFilePermissions.fromString("rwx------"));
        try(EvePortableClaimJournal j=open()){j.prepare(command(),now());}
        Path file=ciphertext();assertEquals(PosixFilePermissions.fromString("rw-------"),Files.getPosixFilePermissions(file));
        Files.setPosixFilePermissions(file,PosixFilePermissions.fromString("rw-r--r--"));reject(this::open);Files.setPosixFilePermissions(file,PosixFilePermissions.fromString("rw-------"));
        Path moved=root.resolve("saved");Files.move(file,moved);Files.createSymbolicLink(file,moved);reject(this::open);
    }
    @Test public void rejectsAuthenticatedButMalformedJournalRecordsWithoutDeletingThem() throws Exception {
        JSONObject saved;
        try(EvePortableClaimJournal j=open()){saved=j.prepare(command(),now());}
        for(String corruption:new String[]{"state","claim","revision","command"}){
            JSONObject row=new JSONObject(saved.toString());
            JSONObject records=new JSONObject().put(id(),row),decoded=new JSONObject().put("schema","rockstaros.pixel-claim-journal/1").put("revision",1).put("records",records);
            if("state".equals(corruption))row.put("state","acked");
            if("claim".equals(corruption))row.put("claimId","invalid");
            if("revision".equals(corruption))decoded.put("revision",123);
            if("command".equals(corruption))row.getJSONObject("command").getJSONObject("request").put("input","tampered");
            javax.crypto.Cipher cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.ENCRYPT_MODE,key);
            cipher.updateAAD(("rockstaros.pixel-claim-journal/1\0dev.rock.shell\0https://avoado.si\0"+owner()+"\0"+device()).getBytes(StandardCharsets.UTF_8));
            byte[] encrypted=cipher.doFinal(decoded.toString().getBytes(StandardCharsets.UTF_8));
            JSONObject envelope=new JSONObject().put("schema","rockstaros.pixel-claim-journal/1").put("nonce",java.util.Base64.getEncoder().encodeToString(cipher.getIV())).put("ciphertext",java.util.Base64.getEncoder().encodeToString(encrypted));
            byte[] bad=envelope.toString().getBytes(StandardCharsets.UTF_8);Files.write(ciphertext(),bad);reject(this::open);assertArrayEquals(bad,Files.readAllBytes(ciphertext()));
        }
    }
    @Test public void missingKeyAndUnsafeLockFailClosedWithoutCreatingCredentials() throws Exception {
        try(EvePortableClaimJournal j=new EvePortableClaimJournal(root,"dev.rock.shell","https://avoado.si",owner(),device(),()->{throw new IOException("key missing");})){
            reject(() -> j.prepare(command(),now()));reject(() -> j.prepare(command(),now()));
        }
        try(java.util.stream.Stream<Path> p=Files.list(root)){assertEquals(0,p.filter(x->x.toString().endsWith(".bin")).count());}
        Path lock;try(java.util.stream.Stream<Path> p=Files.list(root)){lock=p.filter(x->x.toString().endsWith(".lock")).findFirst().orElseThrow();}
        Files.setPosixFilePermissions(lock,PosixFilePermissions.fromString("rw-r--r--"));reject(this::open);
        Files.delete(lock);Path other=Files.createFile(root.resolve("other"));Files.createSymbolicLink(lock,other);reject(this::open);assertEquals(0,Files.size(other));
    }
    @Test public void postRenameFailureFencesStaleMemoryAndReopensTheCommittedClaim() throws Exception {
        try(EvePortableClaimJournal j=new EvePortableClaimJournal(root,"dev.rock.shell","https://avoado.si",owner(),device(),()->key,()->{throw new IOException("lost durability acknowledgement");})){
            reject(() -> j.prepare(command(),now()));byte[] committed=Files.readAllBytes(ciphertext());
            reject(() -> j.prepare(command(),now()));reject(() -> j.read(id()));reject(() -> j.advance(id(),0,"claim_unknown"));
            assertArrayEquals(committed,Files.readAllBytes(ciphertext()));
        }
        try(EvePortableClaimJournal j=open()){assertEquals("prepared",j.read(id()).getString("state"));assertTrue(EvePortableCommands.id(j.read(id()).getString("claimId")));}
    }
}
