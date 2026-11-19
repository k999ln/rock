package dev.rock.shell;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** Private stop capabilities only. No account key, token, owner name or content.
 * This file cannot authorize execution, publication or account access.
 */
final class EvePortableStopHandles {
    interface Bridge { JSONObject request(JSONObject command) throws Exception; }
    private static final String FORMAT="rockstaros.pixel-stop-handles/1";
    private static final int MAX_BYTES=100000, MAX_ROWS=100;
    private static final Object PROCESS_LOCK=new Object();
    private final Path directory,file,lockFile;
    EvePortableStopHandles(Path directory)throws Exception {
        this.directory=directory;
        Files.createDirectories(directory,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        privateDirectory();file=directory.resolve("handles.json");lockFile=directory.resolve("handles.lock");
    }
    private void privateDirectory()throws Exception {
        if(!Files.isDirectory(directory,LinkOption.NOFOLLOW_LINKS)||!Files.getPosixFilePermissions(directory,LinkOption.NOFOLLOW_LINKS).equals(PosixFilePermissions.fromString("rwx------")))
            throw new IOException("PORTABLE_STOP_PRIVATE_DIRECTORY_REQUIRED");
    }
    private void privateFile(Path path)throws Exception {
        if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS)||!Files.getPosixFilePermissions(path,LinkOption.NOFOLLOW_LINKS).equals(PosixFilePermissions.fromString("rw-------"))
            ||((Number)Files.getAttribute(path,"unix:nlink",LinkOption.NOFOLLOW_LINKS)).intValue()!=1)
            throw new IOException("PORTABLE_STOP_PRIVATE_FILE_REQUIRED");
    }
    private JSONObject frame(JSONObject value)throws Exception {
        EvePortableCommands.fields(value,"schema","action","id","scopeSha256","claimId","requestSha256");
        EvePortableCommands.require("rockstaros.pixel-runtime-bridge/1".equals(value.getString("schema"))&&"runtime-stop-intent".equals(value.getString("action"))
            &&EvePortableCommands.id(value.getString("id"))&&EvePortableCommands.id(value.getString("claimId"))
            &&value.getString("scopeSha256").matches("[a-f0-9]{64}")&&value.getString("requestSha256").matches("[a-f0-9]{64}"));
        return new JSONObject(value.toString());
    }
    private String key(JSONObject value)throws Exception {return EvePortableCommands.sha(EvePortableCommands.canonical(frame(value)));}
    private JSONObject load()throws Exception {
        if(!Files.exists(file,LinkOption.NOFOLLOW_LINKS))return new JSONObject().put("schema",FORMAT).put("activeSessionHash","").put("records",new JSONObject());
        privateFile(file);
        // Bound the actual read as well as the size of the opened file. A second
        // process growing the file after the size check must not allocate memory
        // without a limit or turn a truncated prefix into a valid stop store.
        JSONObject state;byte[] bytes=new byte[MAX_BYTES+1];
        try(FileChannel input=FileChannel.open(file,StandardOpenOption.READ,LinkOption.NOFOLLOW_LINKS)){
            EvePortableCommands.require(input.size()>0&&input.size()<=MAX_BYTES);
            ByteBuffer body=ByteBuffer.wrap(bytes);
            while(body.hasRemaining()){
                int read=input.read(body);if(read<0)break;
                if(read==0)throw new IOException("PORTABLE_STOP_READ_STALLED");
            }
            EvePortableCommands.require(body.position()>0&&body.position()<=MAX_BYTES);
            body.flip();state=new JSONObject(StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(body).toString());
        }finally{Arrays.fill(bytes,(byte)0);}
        EvePortableCommands.fields(state,"schema","activeSessionHash","records");EvePortableCommands.require(FORMAT.equals(state.getString("schema"))
            &&(state.getString("activeSessionHash").isEmpty()||state.getString("activeSessionHash").matches("[a-f0-9]{64}")));
        JSONObject rows=state.getJSONObject("records");EvePortableCommands.require(rows.length()<=MAX_ROWS);
        Iterator<String> keys=rows.keys();while(keys.hasNext()){
            String id=keys.next();JSONObject row=rows.getJSONObject(id);EvePortableCommands.fields(row,"frame","sessionHash","requested");
            EvePortableCommands.require(id.equals(key(row.getJSONObject("frame")))&&row.get("requested") instanceof Boolean&&row.getString("sessionHash").matches("[a-f0-9]{64}"));
        }return state;
    }
    private void save(JSONObject state)throws Exception {
        byte[] bytes=EvePortableCommands.canonical(state).getBytes(StandardCharsets.UTF_8);EvePortableCommands.require(bytes.length<=MAX_BYTES);
        Path temporary=Files.createTempFile(directory,".stops-",".tmp",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        try {
            try(FileChannel output=FileChannel.open(temporary,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS)){
                ByteBuffer body=ByteBuffer.wrap(bytes);while(body.hasRemaining())output.write(body);output.force(true);
            }
            Files.move(temporary,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            try(FileChannel parent=FileChannel.open(directory,StandardOpenOption.READ)){parent.force(true);}
        }finally{Files.deleteIfExists(temporary);Arrays.fill(bytes,(byte)0);}
    }
    private interface Operation<T>{T run(JSONObject state,JSONObject rows)throws Exception;}
    private <T>T access(boolean write,Operation<T> operation)throws Exception {
        synchronized(PROCESS_LOCK){
            privateDirectory();if(Files.exists(lockFile,LinkOption.NOFOLLOW_LINKS))privateFile(lockFile);
            try(FileChannel channel=FileChannel.open(lockFile,new HashSet<>(Arrays.asList(StandardOpenOption.CREATE,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS)),
                    PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));FileLock lock=channel.tryLock()){
                if(lock==null)throw new IOException("PORTABLE_STOP_HANDLES_BUSY");privateFile(lockFile);
                JSONObject state=load(),rows=state.getJSONObject("records");String before=EvePortableCommands.canonical(state);
                T result=operation.run(state,rows);if(write&&!before.equals(EvePortableCommands.canonical(state)))save(state);return result;
            }
        }
    }
    void arm(JSONObject start,String sessionHash)throws Exception {
        EvePortableCommands.require(sessionHash!=null&&sessionHash.matches("[a-f0-9]{64}"));
        JSONObject handle=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-stop-intent")
            .put("id",start.getJSONObject("request").getString("id")).put("scopeSha256",start.getString("scopeSha256"))
            .put("claimId",start.getString("claimId")).put("requestSha256",start.getString("requestSha256"));
        String id=key(handle);
        access(true,(state,rows)->{Iterator<String> keys=rows.keys();while(keys.hasNext())if(rows.getJSONObject(keys.next()).getBoolean("requested"))throw new IOException("PORTABLE_STOP_PENDING");
            if(!rows.has(id)){EvePortableCommands.require(rows.length()<MAX_ROWS);rows.put(id,new JSONObject().put("frame",handle).put("sessionHash",sessionHash).put("requested",false));}
            else EvePortableCommands.require(sessionHash.equals(rows.getJSONObject(id).getString("sessionHash")));
            state.put("activeSessionHash",sessionHash);return null;});
    }
    String activeSession()throws Exception{return access(false,(state,rows)->state.getString("activeSessionHash"));}
    private void requestRows(JSONObject rows,String sessionHash)throws Exception {
        Iterator<String> keys=rows.keys();while(keys.hasNext()){
            JSONObject row=rows.getJSONObject(keys.next());if(sessionHash.equals(row.getString("sessionHash")))row.put("requested",true);
        }
    }
    String requestActive()throws Exception {
        return access(true,(state,rows)->{String session=state.getString("activeSessionHash");if(!session.isEmpty())requestRows(rows,session);return session;});
    }
    void requestSession(String sessionHash)throws Exception {
        EvePortableCommands.require(sessionHash!=null&&sessionHash.matches("[a-f0-9]{64}"));
        access(true,(state,rows)->{requestRows(rows,sessionHash);return null;});
    }
    private JSONArray requested(String sessionHash)throws Exception {
        return access(false,(state,rows)->{JSONArray result=new JSONArray();Iterator<String> keys=rows.keys();while(keys.hasNext()){
            JSONObject row=rows.getJSONObject(keys.next());if(row.getBoolean("requested")&&(sessionHash==null||sessionHash.equals(row.getString("sessionHash"))))result.put(frame(row.getJSONObject("frame")));
        }return result;});
    }
    boolean pending()throws Exception{return requested(null).length()>0;}
    boolean pending(String sessionHash)throws Exception{return requested(sessionHash).length()>0;}
    static boolean requiresStop(boolean deviceLocked,boolean accountActive,boolean interrupted,int httpStatus,boolean journalUnavailable){
        if(httpStatus==401||httpStatus==403||httpStatus==409)return true;
        // A temporarily locked credential is not evidence of unlink or key loss.
        // Current session identity is compared again after the device unlocks.
        return !deviceLocked&&(!accountActive||interrupted||journalUnavailable);
    }
    private void remove(JSONObject handle)throws Exception {String id=key(handle);access(true,(state,rows)->{rows.remove(id);return null;});}
    void observe(JSONObject command,JSONObject response)throws Exception {
        if("runtime-stop-status".equals(command.optString("action"))){
            PixelPortableBridgeProtocol.validate(command,response);
            if(Boolean.TRUE.equals(response.opt("fenceDurable"))&&Arrays.asList("stop_finished","stop_confirmed").contains(response.getString("state")))
                remove(new JSONObject(command.toString()).put("action","runtime-stop-intent"));
            return;
        }
        if(!"runtime-read".equals(command.optString("action")))return;
        PixelPortableBridgeProtocol.validate(command,response);
        String state=response.getString("state");
        if("review".equals(state)||"unknown".equals(state)&&Boolean.TRUE.equals(response.opt("stopConfirmed")))
            remove(new JSONObject(command.toString()).put("action","runtime-stop-intent"));
    }
    int cancelRequested(Bridge bridge,int limit,String sessionHash)throws Exception {
        EvePortableCommands.require(limit>=1&&limit<=8&&(sessionHash==null||sessionHash.matches("[a-f0-9]{64}")));JSONArray frames=requested(sessionHash);if(frames.length()==0)return 0;
        JSONObject probe=new JSONObject().put("schema","rockstaros.pixel-runtime-bridge/1").put("action","runtime-stop-capabilities");
        PixelPortableBridgeProtocol.validate(probe,bridge.request(probe));
        for(int i=0;i<Math.min(limit,frames.length());i++){
            JSONObject intent=frames.getJSONObject(i);PixelPortableBridgeProtocol.validate(intent,bridge.request(intent));
            JSONObject read=new JSONObject(intent.toString()).put("action","runtime-stop-status"),value=bridge.request(read);
            PixelPortableBridgeProtocol.validate(read,value);
            // A durable fence plus no matching execution prevents later dispatch.
            // This retires only the stop handle; it never completes the cloud job.
            if(Boolean.TRUE.equals(value.opt("fenceDurable"))&&Arrays.asList("stop_absent","stop_finished","stop_confirmed").contains(value.getString("state")))remove(intent);
        }return requested(sessionHash).length();
    }
}
