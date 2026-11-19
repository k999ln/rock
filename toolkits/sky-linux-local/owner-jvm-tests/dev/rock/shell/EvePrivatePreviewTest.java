package dev.rock.shell;
import org.junit.Test;
import static org.junit.Assert.*;

public final class EvePrivatePreviewTest {
    @Test public void onlyExactDebugUsbOriginIsEligible() {
        assertTrue(EvePrivatePreview.privateOrigin(true,"http://localhost:5199"));
        for (String origin : new String[]{"https://avoado.si","http://localhost:5198","http://127.0.0.1:5199","http://localhost:5199/","http://localhost:5199.evil.test","http://192.168.1.1:5199"})
            assertFalse(EvePrivatePreview.privateOrigin(true,origin));
        assertFalse(EvePrivatePreview.privateOrigin(false,"http://localhost:5199"));
        assertFalse(EvePrivatePreview.privateOrigin(true,null));
    }
    @Test public void unconfirmedJobsBlockConnectionSwitch() {
        for (String status : new String[]{"active","draft","queued","ready","unknown","stopping","",null})
            assertFalse(EvePrivatePreview.finished(status));
        for (String status : new String[]{"review","completed","stopped","failed","cancelled"})
            assertTrue(EvePrivatePreview.finished(status));
    }
    @Test public void privateAuthorizationUriIsExactAndNormalConstructorStaysHttps() throws Exception {
        dev.rock.core.platform.RockstarDeviceAuthorizationFlow.HttpTransport http = new dev.rock.core.platform.RockstarDeviceAuthorizationFlow.HttpTransport() {
            public String serviceOrigin(){return "http://localhost:5199";}
            public java.util.Map<String,Object> post(String path,java.util.Map<String,Object> input){return null;}
        };
        dev.rock.core.platform.RockstarDeviceAuthorizationFlow.SessionStore store = (token,expiry,owner)->{};
        Class<?> type = dev.rock.core.platform.RockstarDeviceAuthorizationFlow.class;
        java.lang.reflect.Method uri = type.getDeclaredMethod("uri",String.class);uri.setAccessible(true);
        Object normal = new dev.rock.core.platform.RockstarDeviceAuthorizationFlow(http,store);
        Object preview = new dev.rock.core.platform.RockstarDeviceAuthorizationFlow(http,store,true);
        assertEquals("localhost",((java.net.URI)uri.invoke(preview,"http://localhost:5199/connect/device")).getHost());
        assertEquals("avoado.si",((java.net.URI)uri.invoke(normal,"https://avoado.si/connect/device")).getHost());
        for(Object flow:new Object[]{normal,preview}) {
            for(String value:new String[]{"http://localhost:5198/connect/device","http://127.0.0.1:5199/connect/device","http://evil.test:5199/connect/device","http://user@localhost:5199/connect/device","http://localhost:5199.evil.test/connect/device"}) {
                try{uri.invoke(flow,value);fail(value);}catch(java.lang.reflect.InvocationTargetException expected){assertTrue(expected.getCause() instanceof java.io.IOException);}
            }
        }
        try{uri.invoke(normal,"http://localhost:5199/connect/device");fail();}catch(java.lang.reflect.InvocationTargetException expected){assertTrue(expected.getCause() instanceof java.io.IOException);}
    }
    @Test public void portableJournalDefaultRejectsHttpAndPreviewOptInIsExact() throws Exception {
        java.nio.file.Path directory=java.nio.file.Files.createTempDirectory("private-journal-test-");
        javax.crypto.KeyGenerator generator=javax.crypto.KeyGenerator.getInstance("AES");generator.init(256);javax.crypto.SecretKey key=generator.generateKey();
        try {
            try {new EvePortableClaimJournal(directory,"dev.rock.shell","http://localhost:5199","local_seedy","11111111-1111-4111-8111-111111111111",()->key);fail();}catch(java.io.IOException expected){}
            try(EvePortableClaimJournal journal=new EvePortableClaimJournal(directory,"dev.rock.shell","http://localhost:5199","local_seedy","11111111-1111-4111-8111-111111111111",()->key,()->{},true)){assertNotNull(journal);}
            for(String origin:new String[]{"http://localhost:5198","http://127.0.0.1:5199","http://evil.test:5199"}){
                try{new EvePortableClaimJournal(directory,"dev.rock.shell",origin,"local_seedy","11111111-1111-4111-8111-111111111111",()->key,()->{},true);fail();}catch(java.io.IOException expected){}
            }
        } finally {try(java.util.stream.Stream<java.nio.file.Path> files=java.nio.file.Files.walk(directory)){for(java.nio.file.Path file:files.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new))java.nio.file.Files.deleteIfExists(file);}}
    }
}
