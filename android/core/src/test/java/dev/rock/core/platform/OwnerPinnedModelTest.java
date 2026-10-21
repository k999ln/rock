package dev.rock.core.platform;
import dev.rock.core.Engine;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;
public final class OwnerPinnedModelTest {
    ModelProfileManifest profile(String publisher,String key,String signature){return new ModelProfileManifest("sky.model.example",1,"a".repeat(64),"b".repeat(64),"c".repeat(64),"Apache-2.0",publisher,key,signature,"org.rockstar.runtime.localai",8,4,4,"GGUF","Q4_K_M",2048,"local-work@1/output-v1",1024,4096);}
    @Test public void unsignedOwnerPinCannotMasqueradeAsPublisherSignature(){
        ModelProfileManifest p=profile("owner-pin:"+"d".repeat(64),"owner-consent","");assertTrue(p.ownerPinned());
        SecurityException e=assertThrows(SecurityException.class,()->new TrustedModelPublisherVerifier(List.of()).verifySignature(p));
        assertEquals("MODEL_AUTHOR_SIGNATURE_ABSENT",e.getMessage());
        assertThrows(IllegalArgumentException.class,()->profile("claimed.author","owner-consent",""));
        assertThrows(IllegalArgumentException.class,()->profile("owner-pin:"+"d".repeat(64),"other.key",""));
    }
    @Test public void admissionFailureStopsBeforeStagingAndRuntime(){
        ModelProfileManifest p=profile("owner-pin:"+"d".repeat(64),"owner-consent","");
        TrustedModelArtifactPipeline denied=new TrustedModelArtifactPipeline(x->{throw new SecurityException("OWNER_MISMATCH");},x->{fail("must not stage");return "";},(x,r)->{fail("must not load");return "";});
        assertThrows(SecurityException.class,()->denied.verifyAndLoad(p));
        assertTrue(new TrustedModelArtifactPipeline(x->Engine.digest("owner-admission"),x->Engine.digest("verified-artifact"),(x,r)->Engine.digest("real-load-receipt")).verifyAndLoad(p).matches("[a-f0-9]{64}"));
    }
}
