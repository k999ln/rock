package dev.rock.shell;

import android.app.KeyguardManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import javax.crypto.SecretKey;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Synthetic private journal only. Uses an existing key; never calls any network or executor. */
@RunWith(AndroidJUnit4.class)
public final class PixelPortableJournalDeviceTest {
    private static EvePortableClaimJournal open(Path directory,JSONObject fixture,SecretKey key)throws Exception{
        return new EvePortableClaimJournal(directory,"dev.rock.shell","https://synthetic.invalid",
            fixture.getString("owner"),fixture.getString("device"),()->key);
    }
    @Test public void existingKeystoreSealsAndReopensIsolatedSyntheticJournal()throws Exception{
        assertEquals("physical",InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget"));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertFalse(context.getSystemService(KeyguardManager.class).isDeviceLocked());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        assertTrue("Never create a test key",keys.containsAlias("eve-account-session-aes-v1"));
        List<String> aliases=Collections.list(keys.aliases());Collections.sort(aliases);
        SecretKey key=EveAccountSessionStore.existingJournalKey();assertNull(key.getEncoded());
        JSONObject fixture;
        try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("portable-command-fixture.json")){
            fixture=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
        }
        JSONObject command=fixture.getJSONObject("command");String id=command.getJSONObject("request").getString("id");
        long now=fixture.getLong("now");Path parent=context.getNoBackupFilesDir().toPath();
        Path directory=Files.createTempDirectory(parent,"portable-journal-physical-test-",
            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        JSONObject proof=new JSONObject().put("schema","rockstaros.pixel-journal-device-proof/1")
            .put("accepted",false).put("newInference",0).put("newRemoteClaims",0).put("newGrants",0).put("newKeys",0);
        try{
            JSONObject saved;
            try(EvePortableClaimJournal journal=open(directory,fixture,key)){
                saved=journal.prepare(command,now);assertEquals("prepared",saved.getString("state"));
                boolean locked=false;try(EvePortableClaimJournal forbidden=open(directory,fixture,key)){fail("Second writer must be rejected");}
                catch(Exception expected){locked=true;}assertTrue(locked);
                journal.advance(id,0,"claim_unknown");
            }
            Path ciphertext=directory.resolve(EvePortableCommands.sha("https://synthetic.invalid\0"+fixture.getString("owner")+"\0"+fixture.getString("device"))+".bin");
            byte[] sealed=Files.readAllBytes(ciphertext);assertEquals(PosixFilePermissions.fromString("rw-------"),Files.getPosixFilePermissions(ciphertext));
            try(EvePortableClaimJournal journal=open(directory,fixture,key)){
                JSONObject restored=journal.read(id);assertEquals(saved.getString("claimId"),restored.getString("claimId"));
                assertEquals("claim_unknown",restored.getString("state"));assertEquals(1,restored.getLong("revision"));
                assertEquals(EvePortableCommands.canonical(command),EvePortableCommands.canonical(restored.getJSONObject("command")));
                assertEquals(saved.getString("claimId"),journal.prepare(command,now+600000).getString("claimId"));
                assertEquals(1,journal.records().length());
            }
            assertArrayEquals("Reopen and idempotent prepare must not rewrite ciphertext",sealed,Files.readAllBytes(ciphertext));
            JSONObject box=new JSONObject(new String(sealed,StandardCharsets.UTF_8));String encoded=box.getString("ciphertext");
            box.put("ciphertext",(encoded.charAt(0)=='A'?"B":"A")+encoded.substring(1));Files.write(ciphertext,box.toString().getBytes(StandardCharsets.UTF_8));
            boolean rejected=false;try(EvePortableClaimJournal forbidden=open(directory,fixture,key)){fail("Changed ciphertext must be rejected");}
            catch(Exception expected){rejected=true;}assertTrue(rejected);
            List<String> after=Collections.list(keys.aliases());Collections.sort(after);assertEquals(aliases,after);
            proof.put("accepted",true).put("syntheticClaimRecords",1).put("sameClaimAfterReopen",true)
                .put("secondWriterRejected",true).put("tamperedCiphertextRejected",true).put("keyAliasesUnchanged",true)
                .put("atomicWriteAndDirectorySyncConfirmed",true).put("observedAt",System.currentTimeMillis());
        }finally{
            assertEquals(parent,directory.getParent());
            try(java.util.stream.Stream<Path> paths=Files.walk(directory)){
                List<Path> own=new ArrayList<>();paths.forEach(own::add);own.sort(Comparator.reverseOrder());
                for(Path path:own)Files.delete(path);
            }
            proof.put("syntheticDirectoryRemoved",!Files.exists(directory));
            try(OutputStream out=context.openFileOutput("pixel-portable-journal-device.json",Context.MODE_PRIVATE)){
                out.write(proof.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
    }
}
