package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.util.Objects;

/** Composes publisher authenticity, artifact staging and runtime loading before profile activation. */
public final class TrustedModelArtifactPipeline implements PlatformStore.ModelArtifactVerifier {
    @FunctionalInterface
    public interface StagedArtifactVerifier {
        /** Fetch and verify bytes against the signed manifest, license and storage constraints, then stage them. */
        String verifyAndStage(ModelProfileManifest profile);
    }

    @FunctionalInterface
    public interface RuntimeModelLoader {
        /** Transfer, load and recheck this exact profile in the approved runtime; return a digest receipt. */
        String installAndLoad(ModelProfileManifest profile, String stagedArtifactReceipt);
    }

    private final TrustedModelPublisherVerifier publisherVerifier;
    private final StagedArtifactVerifier artifactVerifier;
    private final RuntimeModelLoader runtimeModelLoader;

    public TrustedModelArtifactPipeline(TrustedModelPublisherVerifier publisherVerifier,
        StagedArtifactVerifier artifactVerifier, RuntimeModelLoader runtimeModelLoader) {
        this.publisherVerifier = Objects.requireNonNull(publisherVerifier, "MODEL_PUBLISHER_VERIFIER_REQUIRED");
        this.artifactVerifier = Objects.requireNonNull(artifactVerifier, "MODEL_ARTIFACT_VERIFIER_REQUIRED");
        this.runtimeModelLoader = Objects.requireNonNull(runtimeModelLoader, "MODEL_RUNTIME_LOADER_REQUIRED");
    }

    @Override public String verifyAndLoad(ModelProfileManifest profile) {
        String publisherReceipt = publisherVerifier.verifySignature(profile);
        String artifactReceipt = artifactVerifier.verifyAndStage(profile);
        if (artifactReceipt == null || !artifactReceipt.matches("[a-f0-9]{64}"))
            throw new SecurityException("MODEL_ARTIFACT_VERIFICATION_REQUIRED");
        String runtimeReceipt = runtimeModelLoader.installAndLoad(profile, artifactReceipt);
        if (runtimeReceipt == null || !runtimeReceipt.matches("[a-f0-9]{64}"))
            throw new SecurityException("MODEL_RUNTIME_LOAD_RECEIPT_REQUIRED");
        return Engine.digest("rockstaros-model-artifact-pipeline/2\n" + profile.digest()
            + "\n" + publisherReceipt + "\n" + artifactReceipt + "\n" + runtimeReceipt);
    }
}
