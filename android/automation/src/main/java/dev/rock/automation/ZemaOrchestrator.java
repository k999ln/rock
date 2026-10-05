package dev.rock.automation;

import dev.rock.core.Engine;
import dev.rock.sdk.ZemaToolPlan;
import java.util.UUID;

/** Broker-owned path from Zema text to an exact selected Tool job. */
final class ZemaOrchestrator {
    private final android.content.Context context;
    private final Engine engine;

    ZemaOrchestrator(android.content.Context context, Engine engine) {
        this.context = context;
        this.engine = engine;
    }

    String submit(String requestId, String selectionToken, String prompt, String contextJson,
                  boolean consent) throws Exception {
        synchronized (ModelProfileOperationLock.LOCK) {
            return submitLocked(requestId, selectionToken, prompt, contextJson, consent);
        }
    }

    private String submitLocked(String requestId, String selectionToken, String prompt, String contextJson,
                                boolean consent) throws Exception {
        if (!consent) throw new SecurityException("LOCAL_ARTIFACT_CONSENT_REQUIRED");
        String toolId = engine.requireSkySelection(selectionToken);
        String planningPrompt = ZemaToolPlan.planningPrompt(toolId, prompt);
        Engine.bounded(prompt);
        Engine.bounded(contextJson);
        String requestDigest = Engine.digest("rockstaros-zema-plan/1\n" + toolId + "\n"
            + ZemaToolPlan.ARTICLE_PLAN_SCHEMA + "\n" + planningPrompt + "\n" + contextJson);
        String owner = AndroidOwner.current(context);
        String existing = engine.existingPinnedWorkId(owner, requestId, requestDigest);
        if (existing != null) return existing;
        Engine.ModelProfilePin pin = engine.prepareModelProfilePin(owner, requestId,
            requestDigest, System.currentTimeMillis());
        LocalAiConnection localAi = new LocalAiConnection(context);
        localAi.requireReadyForPlanning(pin);
        LocalAiConnection.Result result = localAi.plan(
            UUID.randomUUID().toString(), pin, ZemaToolPlan.ARTICLE_PLAN_SCHEMA,
            planningPrompt, contextJson);
        if (!"completed".equals(result.event)) {
            if ("proposal".equals(result.event))
                throw new SecurityException("LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL");
            throw new IllegalStateException("LOCAL_AI_PLAN_FAILED");
        }
        String input = ZemaToolPlan.verifiedInput(toolId, result.payload);
        localAi.requireReadyForPlanning(pin);
        if (!toolId.equals(engine.requireSkySelection(selectionToken)))
            throw new SecurityException("SKY_SELECTION_MISMATCH");
        return engine.submitPinned(pin, requestId, input, false, true);
    }
}
