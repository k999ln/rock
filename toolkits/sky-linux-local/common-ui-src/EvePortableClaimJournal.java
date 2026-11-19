package dev.rock.shell;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;
import org.json.JSONArray;

/** Private execution observations. No state in this file authorizes network or engine work. */
final class EvePortableClaimJournal implements AutoCloseable {
    interface KeySource { SecretKey key() throws Exception; }
    interface CommitProbe { void afterMove() throws Exception; }
    private static final String FORMAT = "rockstaros.pixel-claim-journal/1";
    private static final int MAX = 4 * 1024 * 1024;
    private static final String[] STATES = { "prepared", "claim_unknown", "claimed", "dispatch_unknown",
        "dispatched", "report_unknown", "reported", "acked" };
    private final Path file;
    private final String owner, device;
    private final byte[] aad;
    private final KeySource keys;
    private final CommitProbe probe;
    private final FileChannel guard;
    private final FileLock lock;
    private JSONObject state;
    private boolean closed, uncertain;

    EvePortableClaimJournal(Path directory, String packageName, String origin, String owner,
            String device, KeySource keys) throws Exception {
        this(directory, packageName, origin, owner, device, keys, () -> {});
    }
    EvePortableClaimJournal(Path directory, String packageName, String origin, String owner,
            String device, KeySource keys, CommitProbe probe) throws Exception {
        EvePortableCommands.require(EvePortableCommands.owner(owner) && EvePortableCommands.id(device)
            && packageName != null && packageName.matches("[a-zA-Z][a-zA-Z0-9_.]{0,199}")
            && validOrigin(origin) && keys != null && probe != null);
        this.owner = owner; this.device = device; this.keys = keys; this.probe = probe;
        aad = (FORMAT + "\0" + packageName + "\0" + origin + "\0" + owner + "\0" + device).getBytes(StandardCharsets.UTF_8);
        Files.createDirectories(directory, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        EvePortableCommands.require(Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)
            && Files.getPosixFilePermissions(directory, LinkOption.NOFOLLOW_LINKS).equals(PosixFilePermissions.fromString("rwx------")));
        file = directory.resolve(EvePortableCommands.sha(origin + "\0" + owner + "\0" + device) + ".bin");
        Path lockFile = directory.resolve(file.getFileName() + ".lock");
        if (Files.exists(lockFile, LinkOption.NOFOLLOW_LINKS)) privateFile(lockFile);
        guard = FileChannel.open(lockFile, new HashSet<>(Arrays.asList(StandardOpenOption.CREATE,
            StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)),
            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        FileLock acquired = null;
        try {
            privateFile(lockFile);
            acquired = guard.tryLock();
            if (acquired == null) throw new IOException("PORTABLE_JOURNAL_BUSY");
            lock = acquired;
            state = Files.exists(file, LinkOption.NOFOLLOW_LINKS) ? load()
                : new JSONObject().put("schema", FORMAT).put("revision", 0).put("records", new JSONObject());
        } catch (Exception e) {
            if (acquired != null) acquired.release();
            guard.close(); Arrays.fill(aad, (byte) 0); throw e;
        }
    }
    private static boolean validOrigin(String value) {
        try {
            URI uri = new URI(value);
            int port = uri.getPort();
            return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getRawUserInfo() == null
                && uri.getRawQuery() == null && uri.getRawFragment() == null && uri.getRawPath().isEmpty()
                && (port == -1 || port > 0 && port <= 65535 && port != 443)
                && uri.getHost().equals(uri.getHost().toLowerCase(java.util.Locale.ROOT))
                && value.equals("https://" + uri.getHost() + (port == -1 ? "" : ":" + port));
        } catch (Exception e) { return false; }
    }
    private static void privateFile(Path path) throws Exception {
        EvePortableCommands.require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
            && Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS).equals(PosixFilePermissions.fromString("rw-------")));
    }
    private void open() throws IOException {
        if (closed) throw new IOException("PORTABLE_JOURNAL_CLOSED");
        if (uncertain) throw new IOException("PORTABLE_JOURNAL_WRITE_UNKNOWN");
    }
    private static long stateRevision(String value) {
        for (int i = 0; i < STATES.length; i++) if (STATES[i].equals(value)) return i;
        return -1;
    }
    private void validate(JSONObject decoded) throws Exception {
        EvePortableCommands.fields(decoded, "schema", "revision", "records");
        EvePortableCommands.require(FORMAT.equals(EvePortableCommands.string(decoded, "schema")));
        long revision = EvePortableCommands.integer(decoded, "revision"), sum = 0;
        JSONObject records = decoded.getJSONObject("records");
        EvePortableCommands.require(revision >= 0 && records.length() <= 100);
        Iterator<String> it = records.keys();
        HashSet<String> claims = new HashSet<>();
        while (it.hasNext()) {
            String id = it.next(); JSONObject r = records.getJSONObject(id);
            if(r.has("publication"))EvePortableCommands.fields(r,"id","command","claimId","revision","state","publication");
            else EvePortableCommands.fields(r, "id", "command", "claimId", "revision", "state");
            String claim = EvePortableCommands.string(r, "claimId"), status = EvePortableCommands.string(r, "state");
            long n = EvePortableCommands.integer(r, "revision");
            EvePortableCommands.require(id.equals(EvePortableCommands.string(r, "id")) && EvePortableCommands.id(id)
                && EvePortableCommands.id(claim) && claims.add(claim)
                && ("unknown".equals(status) ? n >= 1 && n <= 7 : n == stateRevision(status) && n >= 0));
            JSONObject command = r.getJSONObject("command");
            EvePortableCommands.verify(command, owner, device, 0, false);
            EvePortableCommands.require(id.equals(command.getJSONObject("request").getString("id")));
            sum += n + 1;
            if(r.has("publication")){
                JSONObject p=r.getJSONObject("publication");EvePortableCommands.fields(p,"report","phase","revision");
                EvePortableCommands.report(p.getJSONObject("report"),command,claim);
                long v=EvePortableCommands.integer(p,"revision");String phase=EvePortableCommands.string(p,"phase");
                EvePortableCommands.require(v>=0&&v<=2&&new String[]{"prepared","confirmed","acked"}[(int)v].equals(phase));sum+=v+1;
            }
        }
        EvePortableCommands.require(sum == revision);
    }
    private JSONObject load() throws Exception {
        privateFile(file); EvePortableCommands.require(Files.size(file) <= MAX);
        byte[] envelope = Files.readAllBytes(file), clear = null;
        try {
            JSONObject box = new JSONObject(new String(envelope, StandardCharsets.UTF_8));
            EvePortableCommands.fields(box, "schema", "nonce", "ciphertext");
            EvePortableCommands.require(FORMAT.equals(EvePortableCommands.string(box, "schema")));
            byte[] nonce = java.util.Base64.getDecoder().decode(EvePortableCommands.string(box, "nonce"));
            byte[] ciphertext = java.util.Base64.getDecoder().decode(EvePortableCommands.string(box, "ciphertext"));
            EvePortableCommands.require(nonce.length == 12 && ciphertext.length >= 16 && ciphertext.length <= MAX);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, keys.key(), new GCMParameterSpec(128, nonce));
            c.updateAAD(aad); clear = c.doFinal(ciphertext);
            JSONObject decoded = new JSONObject(new String(clear, StandardCharsets.UTF_8));
            validate(decoded); return decoded;
        } finally { Arrays.fill(envelope, (byte) 0); if (clear != null) Arrays.fill(clear, (byte) 0); }
    }
    private void save(JSONObject next) throws Exception {
        open(); validate(next);
        // org.json may emit an unpaired UTF-16 surrogate literally. UTF-8 conversion would
        // replace it, corrupting an otherwise valid pinned request on the next open.
        byte[] clear = EvePortableCommands.canonical(next).getBytes(StandardCharsets.UTF_8), bytes = null;
        Path temp = null;
        try {
            EvePortableCommands.require(clear.length <= MAX / 2);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, keys.key()); c.updateAAD(aad);
            byte[] encrypted = c.doFinal(clear), nonce = c.getIV();
            EvePortableCommands.require(nonce.length == 12);
            bytes = new JSONObject().put("schema", FORMAT).put("nonce", java.util.Base64.getEncoder().encodeToString(nonce))
                .put("ciphertext", java.util.Base64.getEncoder().encodeToString(encrypted)).toString().getBytes(StandardCharsets.UTF_8);
            temp = Files.createTempFile(file.getParent(), ".claim-", ".tmp", PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            try (FileChannel out = FileChannel.open(temp, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer b = ByteBuffer.wrap(bytes); while (b.hasRemaining()) out.write(b); out.force(true);
            }
            Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            probe.afterMove();
            try (FileChannel dir = FileChannel.open(file.getParent(), StandardOpenOption.READ)) { dir.force(true); }
            privateFile(file);
            EvePortableCommands.require(MessageDigest.isEqual(bytes, Files.readAllBytes(file))); state = next;
        } catch (Exception e) {
            // A rename or durability acknowledgement may already have committed. Reopen and reconcile;
            // this instance must never overwrite the disk from its older in-memory revision.
            uncertain = true; throw e;
        } finally {
            Arrays.fill(clear, (byte) 0); if (bytes != null) Arrays.fill(bytes, (byte) 0);
            if (temp != null) Files.deleteIfExists(temp);
        }
    }
    synchronized JSONObject prepare(JSONObject command, long now) throws Exception {
        open(); String id = EvePortableCommands.string(command.getJSONObject("request"), "id");
        JSONObject records = state.getJSONObject("records");
        EvePortableCommands.verify(command, owner, device, now, !records.has(id));
        if (records.has(id)) {
            JSONObject prior = records.getJSONObject(id);
            EvePortableCommands.require(EvePortableCommands.canonical(prior.getJSONObject("command")).equals(EvePortableCommands.canonical(command)));
            return new JSONObject(prior.toString());
        }
        EvePortableCommands.require(records.length() < 100);
        JSONObject copy = new JSONObject(state.toString());
        JSONObject record = new JSONObject().put("id", id).put("command", new JSONObject(command.toString()))
            .put("claimId", UUID.randomUUID().toString()).put("revision", 0).put("state", "prepared");
        copy.getJSONObject("records").put(id, record); copy.put("revision", state.getLong("revision") + 1);
        save(copy); return new JSONObject(record.toString());
    }
    synchronized JSONObject advance(String id, long expected, String target) throws Exception {
        open(); JSONObject current = state.getJSONObject("records").getJSONObject(id);
        EvePortableCommands.require(current.getLong("revision") == expected&&!current.has("publication"));
        String from = current.getString("state"); long fromIndex = stateRevision(from);
        boolean allowed = fromIndex >= 0 && fromIndex < 7
            && (stateRevision(target) == fromIndex + 1 || "unknown".equals(target));
        EvePortableCommands.require(allowed);
        JSONObject copy = new JSONObject(state.toString()), record = copy.getJSONObject("records").getJSONObject(id);
        record.put("revision", expected + 1).put("state", target); copy.put("revision", state.getLong("revision") + 1);
        save(copy); return new JSONObject(record.toString());
    }
    synchronized JSONObject read(String id) throws Exception {
        open(); JSONObject r = state.getJSONObject("records").optJSONObject(id);
        return r == null ? null : new JSONObject(r.toString());
    }
    synchronized JSONArray records()throws Exception{
        open();JSONArray result=new JSONArray();java.util.ArrayList<String> ids=new java.util.ArrayList<>();
        Iterator<String> names=state.getJSONObject("records").keys();while(names.hasNext())ids.add(names.next());java.util.Collections.sort(ids);
        for(String id:ids)result.put(new JSONObject(state.getJSONObject("records").getJSONObject(id).toString()));return result;
    }
    synchronized JSONObject stageReport(String id,long expected,JSONObject report)throws Exception{
        open();JSONObject current=state.getJSONObject("records").getJSONObject(id);EvePortableCommands.require(current.getLong("revision")==expected);
        EvePortableCommands.report(report,current.getJSONObject("command"),current.getString("claimId"));
        if(current.has("publication")){
            EvePortableCommands.require(EvePortableCommands.canonical(current.getJSONObject("publication").getJSONObject("report")).equals(EvePortableCommands.canonical(report)));
            return new JSONObject(current.toString());
        }
        EvePortableCommands.require(!"prepared".equals(current.getString("state")));
        JSONObject copy=new JSONObject(state.toString()),r=copy.getJSONObject("records").getJSONObject(id);
        r.put("publication",new JSONObject().put("report",new JSONObject(report.toString())).put("phase","prepared").put("revision",0));
        copy.put("revision",state.getLong("revision")+1);save(copy);return new JSONObject(r.toString());
    }
    synchronized JSONObject publicationStep(String id,long expected,String target)throws Exception{
        open();JSONObject current=state.getJSONObject("records").getJSONObject(id).getJSONObject("publication");
        EvePortableCommands.require(current.getLong("revision")==expected&&((expected==0&&"confirmed".equals(target))||(expected==1&&"acked".equals(target))));
        JSONObject copy=new JSONObject(state.toString()),p=copy.getJSONObject("records").getJSONObject(id).getJSONObject("publication");
        p.put("phase",target).put("revision",expected+1);copy.put("revision",state.getLong("revision")+1);save(copy);
        return new JSONObject(copy.getJSONObject("records").getJSONObject(id).toString());
    }
    @Override public synchronized void close() throws Exception {
        if (closed) return;
        closed = true;
        try { lock.release(); } finally { guard.close(); Arrays.fill(aad, (byte) 0); }
    }
}
