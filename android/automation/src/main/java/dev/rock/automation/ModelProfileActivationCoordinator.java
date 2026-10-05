package dev.rock.automation;

import android.content.Context;
import dev.rock.core.Engine;
import dev.rock.core.platform.ModelProfileManifest;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.ResumableModelArtifactStager;
import dev.rock.core.platform.RuntimeManifest;
import dev.rock.core.platform.TrustedModelArtifactPipeline;
import dev.rock.core.platform.TrustedModelPublisherVerifier;
import java.io.File;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Broker-owned candidate -> verified stage -> runtime load -> active profile flow. */
final class ModelProfileActivationCoordinator {
    private final Context context;
    private final PlatformStore platform;
    private final ResumableModelArtifactStager stager;
    private final TrustedModelPublisherVerifier publishers;

    ModelProfileActivationCoordinator(Context context, PlatformStore platform,
        ResumableModelArtifactStager stager, TrustedModelPublisherVerifier publishers) {
        this.context = context.getApplicationContext();
        this.platform = platform;
        this.stager = stager;
        this.publishers = publishers;
    }

    long installAndActivate(ModelProfileManifest candidate, long now) {
        synchronized (ModelProfileOperationLock.LOCK) {
            if (candidate == null) throw new IllegalArgumentException("MODEL_PROFILE_REQUIRED");
            RuntimeManifest runtime = platform.runtimeManifest(candidate.runtimeComponentId,
                candidate.runtimeVersionCode);
            if (!candidate.accepts(runtime)) throw new SecurityException("PROFILE_RUNTIME_INCOMPATIBLE");
            platform.registerModelProfile(candidate);
            ModelProfileManifest previous = platform.activeModelProfile();
            AtomicBoolean runtimeLoadStarted = new AtomicBoolean(false);
            TrustedModelArtifactPipeline pipeline = new TrustedModelArtifactPipeline(publishers, stager,
                (profile, stageReceipt) -> load(profile, runtime, stageReceipt, runtimeLoadStarted));
            try {
                return platform.activateModelProfile(candidate.profileId, candidate.version, pipeline, now);
            } catch (RuntimeException activationFailure) {
                if (runtimeLoadStarted.get() && previous != null
                        && (!previous.profileId.equals(candidate.profileId) || previous.version != candidate.version)) {
                    try { restore(previous); }
                    catch (Exception restoreFailure) {
                        activationFailure.addSuppressed(restoreFailure);
                        throw new IllegalStateException("MODEL_PROFILE_RUNTIME_ROLLBACK_FAILED", activationFailure);
                    }
                }
                throw activationFailure;
            }
        }
    }

    private String load(ModelProfileManifest profile, RuntimeManifest runtime, String stageReceipt,
                        AtomicBoolean runtimeLoadStarted) {
        if (stageReceipt == null || !stageReceipt.matches("[a-f0-9]{64}") || !profile.accepts(runtime))
            throw new SecurityException("MODEL_RUNTIME_LOAD_INPUT_MISMATCH");
        try {
            File artifact = stager.stagedPath(profile).toFile();
            runtimeLoadStarted.set(true);
            LocalAiConnection.Result result = new LocalAiConnection(context).installAndLoad(
                UUID.randomUUID().toString(), profile, runtime.signingDigest, artifact);
            if (!"completed".equals(result.event))
                throw new IllegalStateException("MODEL_RUNTIME_LOAD_FAILED");
            return Engine.digest("rockstaros-local-ai-profile-load/1\n" + profile.digest()
                + "\n" + stageReceipt + "\n" + runtime.digest() + "\n" + result.payload);
        } catch (RuntimeException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new IllegalStateException("MODEL_RUNTIME_LOAD_FAILED", failure);
        }
    }

    private void restore(ModelProfileManifest previous) throws Exception {
        String receipt = stager.verifyAndStage(previous);
        RuntimeManifest runtime = platform.runtimeManifest(previous.runtimeComponentId,
            previous.runtimeVersionCode);
        if (!previous.accepts(runtime)) throw new SecurityException("MODEL_ROLLBACK_RUNTIME_MISMATCH");
        File artifact = stager.stagedPath(previous).toFile();
        LocalAiConnection.Result result = new LocalAiConnection(context).installAndLoad(
            UUID.randomUUID().toString(), previous, runtime.signingDigest, artifact);
        if (!"completed".equals(result.event) || !receipt.matches("[a-f0-9]{64}"))
            throw new IllegalStateException("MODEL_ROLLBACK_LOAD_FAILED");
    }
}
