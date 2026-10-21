package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public final class TrustedModelPublisherVerifierTest {
    private static final String PUBLISHER = "publisher.qwen";
    private static final String KEY_ID = "qwen.release.1";

    private static ModelProfileManifest profile(KeyPair pair, String publisher, String keyId,
        String weights, String signatureOverride) throws Exception {
        String signatureValue = signatureOverride;
        ModelProfileManifest unsigned = new ModelProfileManifest("profile.lifeline.qwen", 1,
            Engine.digest(weights), Engine.digest("tokenizer"), Engine.digest("template"),
            "Apache-2.0", publisher, keyId, "A".repeat(86), "org.rockstar.runtime.localai",
            2, 1, 1, "GGUF", "Q4_K_M", 8192, "article-preparation@1/input-v1", 4_096, 8_192);
        if (signatureValue == null) {
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(pair.getPrivate());
            signer.update(unsigned.signedPayload().getBytes(StandardCharsets.UTF_8));
            signatureValue = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());
        }
        return new ModelProfileManifest(unsigned.profileId, unsigned.version, unsigned.weightsSha256,
            unsigned.tokenizerSha256, unsigned.templateSha256, unsigned.licenseId, publisher, keyId,
            signatureValue, unsigned.runtimeComponentId, unsigned.runtimeVersionCode,
            unsigned.runtimeApiMin, unsigned.runtimeApiMax, unsigned.format, unsigned.quantization,
            unsigned.contextTokens, unsigned.planSchemaId, unsigned.artifactBytes, unsigned.minRamBytes);
    }

    private static byte[] rawPublicKey(KeyPair pair) {
        byte[] encoded = pair.getPublic().getEncoded();
        return java.util.Arrays.copyOfRange(encoded, encoded.length - 32, encoded.length);
    }

    @Test public void acceptsOnlyAnEd25519SignatureForTheExactPublisherKeyAndManifest() throws Exception {
        KeyPair pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        TrustedModelPublisherVerifier verifier = new TrustedModelPublisherVerifier(List.of(
            new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, rawPublicKey(pair), false)));
        ModelProfileManifest profile = profile(pair, PUBLISHER, KEY_ID, "weights-v1", null);

        String receipt = verifier.verifySignature(profile);
        assertTrue(receipt.matches("[a-f0-9]{64}"));
        ModelProfileManifest alteredWeights = new ModelProfileManifest(profile.profileId, profile.version,
            Engine.digest("weights-v2"), profile.tokenizerSha256, profile.templateSha256, profile.licenseId,
            profile.publisherId, profile.signingKeyId, profile.manifestSignatureBase64Url,
            profile.runtimeComponentId, profile.runtimeVersionCode, profile.runtimeApiMin,
            profile.runtimeApiMax, profile.format, profile.quantization, profile.contextTokens,
            profile.planSchemaId, profile.artifactBytes, profile.minRamBytes);
        assertThrows(SecurityException.class,
            () -> verifier.verifySignature(alteredWeights));
        assertThrows(SecurityException.class,
            () -> verifier.verifySignature(profile(pair, "publisher.other", KEY_ID, "weights-v1", null)));
        assertThrows(SecurityException.class,
            () -> verifier.verifySignature(profile(pair, PUBLISHER, "qwen.release.2", "weights-v1", null)));
    }

    @Test public void rejectsUntrustedRevokedAndMalformedPublisherKeysAndSignatures() throws Exception {
        KeyPair pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        ModelProfileManifest valid = profile(pair, PUBLISHER, KEY_ID, "weights-v1", null);
        TrustedModelPublisherVerifier empty = new TrustedModelPublisherVerifier(List.of());
        assertThrows(SecurityException.class, () -> empty.verifySignature(valid));

        TrustedModelPublisherVerifier revoked = new TrustedModelPublisherVerifier(List.of(
            new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, rawPublicKey(pair), true)));
        assertThrows(SecurityException.class, () -> revoked.verifySignature(valid));

        TrustedModelPublisherVerifier trusted = new TrustedModelPublisherVerifier(List.of(
            new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, rawPublicKey(pair), false)));
        ModelProfileManifest badSignature = profile(pair, PUBLISHER, KEY_ID, "weights-v1", "A".repeat(86));
        assertThrows(SecurityException.class, () -> trusted.verifySignature(badSignature));
        assertThrows(IllegalArgumentException.class, () ->
            new TrustedModelPublisherVerifier(List.of(
                new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, new byte[31], false))));
        assertThrows(IllegalArgumentException.class, () ->
            new TrustedModelPublisherVerifier(List.of(
                new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, rawPublicKey(pair), false),
                new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, rawPublicKey(pair), false))));
    }

    @Test public void artifactStagingRunsOnlyAfterPublisherVerificationAndRequiresAReceipt() throws Exception {
        KeyPair pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        TrustedModelPublisherVerifier publishers = new TrustedModelPublisherVerifier(List.of(
            new TrustedModelPublisherVerifier.PublisherKey(PUBLISHER, KEY_ID, rawPublicKey(pair), false)));
        ModelProfileManifest valid = profile(pair, PUBLISHER, KEY_ID, "weights-v1", null);
        final int[] stageCalls = {0};
        TrustedModelArtifactPipeline pipeline = new TrustedModelArtifactPipeline(publishers, candidate -> {
            stageCalls[0]++;
            assertEquals(valid.digest(), candidate.digest());
            return Engine.digest("fixture staged artifact receipt");
        }, (candidate, stageReceipt) -> {
            assertEquals(valid.digest(), candidate.digest());
            assertTrue(stageReceipt.matches("[a-f0-9]{64}"));
            return Engine.digest("fixture runtime loaded receipt");
        });
        assertTrue(pipeline.verifyAndLoad(valid).matches("[a-f0-9]{64}"));
        assertEquals(1, stageCalls[0]);

        ModelProfileManifest invalid = profile(pair, PUBLISHER, KEY_ID, "weights-v1", "A".repeat(86));
        assertThrows(SecurityException.class, () -> pipeline.verifyAndLoad(invalid));
        assertEquals("publisher signature failure must stop before staged artifacts are opened", 1, stageCalls[0]);

        TrustedModelArtifactPipeline missingStageReceipt = new TrustedModelArtifactPipeline(publishers,
            candidate -> null, (candidate, stageReceipt) -> Engine.digest("must not run"));
        assertThrows(SecurityException.class, () -> missingStageReceipt.verifyAndLoad(valid));
        TrustedModelArtifactPipeline missingRuntimeReceipt = new TrustedModelArtifactPipeline(publishers,
            candidate -> Engine.digest("fixture staged artifact receipt"), (candidate, stageReceipt) -> null);
        assertThrows(SecurityException.class, () -> missingRuntimeReceipt.verifyAndLoad(valid));
    }
}
