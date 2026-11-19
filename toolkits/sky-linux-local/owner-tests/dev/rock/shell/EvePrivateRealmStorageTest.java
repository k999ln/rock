package dev.rock.shell;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Synthetic credentials in a temporary test directory only; no grants, network, keys or inference. */
@RunWith(AndroidJUnit4.class)
public final class EvePrivateRealmStorageTest {
    @Test public void allDefaultReadersKeepRealmsSeparate() throws Exception {
        Context actual=InstrumentationRegistry.getInstrumentation().getTargetContext();
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        assertTrue(keys.containsAlias("eve-account-session-aes-v1"));
        File test=Files.createTempDirectory(actual.getCacheDir().toPath(),"realm-isolation-").toFile();
        Context isolated=new ContextWrapper(actual){
            @Override public Context getApplicationContext(){return this;}
            @Override public File getNoBackupFilesDir(){return test;}
        };
        try {
            EveAccountSessionStore normal=new EveAccountSessionStore(isolated,"https://avoado.si");
            normal.save("rock_session_"+"A".repeat(43),System.currentTimeMillis()+600000,"account:normal-fixture");
            File normalFile=new File(test,"account/eve-account-session-v2.bin");
            byte[] before=Files.readAllBytes(normalFile.toPath());
            EveAccountSessionStore preview=new EveAccountSessionStore(isolated,EvePrivatePreview.ORIGIN);
            assertEquals(0,preview.activeExpiry());
            assertArrayEquals(before,Files.readAllBytes(normalFile.toPath()));
            preview.save("rock_session_"+"B".repeat(43),System.currentTimeMillis()+600000,"account:preview-fixture");
            assertEquals("account:preview-fixture",new EveAccountSessionStore(isolated,EvePrivatePreview.ORIGIN).ownerUserId());
            assertEquals("account:normal-fixture",normal.ownerUserId());
            preview.clearLocal();
            assertArrayEquals(before,Files.readAllBytes(normalFile.toPath()));
            assertEquals("account:normal-fixture",normal.ownerUserId());
            assertTrue(new File(test,"private-eve-preview").isDirectory());
            Arrays.fill(before,(byte)0);
            // Real approved private session can be captured without any HTTP request.
            assertTrue(EvePrivatePreview.selected(actual));
            assertTrue(new EvePortableAccountBinding(actual).active());
        } finally {
            try(java.util.stream.Stream<java.nio.file.Path> paths=Files.walk(test.toPath())){
                for(java.nio.file.Path path:paths.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new))Files.deleteIfExists(path);
            }
        }
    }
}
