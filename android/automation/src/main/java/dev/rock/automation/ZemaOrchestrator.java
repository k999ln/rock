package dev.rock.automation;

import dev.rock.core.Engine;
import dev.rock.sdk.ZemaToolPlan;
import java.util.UUID;

/** Broker-owned path from Zema text to an exact selected Tool job. */
final class ZemaOrchestrator {
    private static final LocalPlanningFence PLANNING = new LocalPlanningFence();
    static void setPaused(Engine engine, boolean paused) {
        long identity = android.os.Binder.clearCallingIdentity();
        try { PLANNING.changePause(paused, () -> engine.setPaused(paused)); }
        finally { android.os.Binder.restoreCallingIdentity(identity); }
    }
    private final android.content.Context context;
    private final Engine engine;

    ZemaOrchestrator(android.content.Context context, Engine engine) {
        this.context = context;
        this.engine = engine;
    }

    String submit(String requestId, String selectionToken, String prompt, String contextJson,
                  boolean consent) throws Exception {
        return submitSelected(requestId, selectionToken, prompt, contextJson, null, consent);
    }

    String submitSelected(String requestId, String selectionToken, String prompt, String contextJson,
                          String expectedModelDigest, boolean consent) throws Exception {
        long identity = android.os.Binder.clearCallingIdentity();
        try {
            synchronized (ModelProfileOperationLock.LOCK) {
                return submitLocked(requestId, selectionToken, prompt, contextJson, expectedModelDigest, consent);
            }
        } finally { android.os.Binder.restoreCallingIdentity(identity); }
    }

    private String submitLocked(String requestId, String selectionToken, String prompt, String contextJson,
                                String expectedModelDigest, boolean consent) throws Exception {
        if (!consent) throw new SecurityException("LOCAL_ARTIFACT_CONSENT_REQUIRED");
        String toolId = engine.requireSkySelection(selectionToken);
        String planningPrompt = ZemaToolPlan.planningPrompt(toolId, prompt);
        Engine.bounded(prompt);
        Engine.bounded(contextJson);
        String requestDigest = Engine.digest("rockstaros-zema-plan/1\n" + toolId + "\n"
            + ZemaToolPlan.ARTICLE_PLAN_SCHEMA + "\n" + planningPrompt + "\n" + contextJson
            + (expectedModelDigest == null ? "" : "\nselected-model:" + expectedModelDigest));
        String owner = AndroidOwner.current(context);
        String existing = engine.existingPinnedWorkId(owner, requestId, requestDigest);
        if (existing != null) return existing;
        if (expectedModelDigest != null) {
            if (engine.paused()) throw new IllegalStateException("LOCAL_EXECUTION_PAUSED");
            new LocalModelChoice(context, ((RockApplication) context.getApplicationContext()).platform()).ensureLoaded(expectedModelDigest);
        }
        Engine.ModelProfilePin pin = engine.prepareModelProfilePin(owner, requestId,
            requestDigest, System.currentTimeMillis());
        if (expectedModelDigest != null && !expectedModelDigest.equals(pin.manifestDigest))
            throw new SecurityException("MODEL_SELECTION_CHANGED");
        LocalAiConnection localAi = new LocalAiConnection(context);
        String token = UUID.randomUUID().toString();
        LocalPlanningFence.Attempt planning = PLANNING.begin(engine::paused, () -> localAi.cancel(token));
        try {
        localAi.requireReadyForPlanning(pin);
        LocalAiConnection.Result result = localAi.plan(
            token, pin, ZemaToolPlan.ARTICLE_PLAN_SCHEMA, planningPrompt, contextJson);
        if (!"completed".equals(result.event)) {
            if ("proposal".equals(result.event))
                throw new SecurityException("LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL");
            throw new IllegalStateException("LOCAL_AI_PLAN_FAILED");
        }
        String input = ZemaToolPlan.verifiedInput(toolId, result.payload);
        localAi.requireReadyForPlanning(pin);
        if (!toolId.equals(engine.requireSkySelection(selectionToken)))
            throw new SecurityException("SKY_SELECTION_MISMATCH");
        return PLANNING.commit(planning, engine::paused,
            () -> engine.submitPinned(pin, requestId, input, false, true));
        } catch (Exception failure) {
            if (PLANNING.stopped(planning)) throw new IllegalStateException("LOCAL_EXECUTION_PAUSED", failure);
            throw failure;
        } finally { PLANNING.finish(planning); }
    }
}
