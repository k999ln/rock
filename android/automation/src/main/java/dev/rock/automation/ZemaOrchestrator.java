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

    String submit(String requestId, String toolId, String prompt, String contextJson,
                  boolean consent) throws Exception {
        if (!consent) throw new SecurityException("LOCAL_ARTIFACT_CONSENT_REQUIRED");
        String existing = engine.existingWorkId(requestId);
        if (existing != null) return existing;
        String planningPrompt = ZemaToolPlan.planningPrompt(toolId, prompt);
        LocalAiConnection.Result result = new LocalAiConnection(context).plan(
            UUID.randomUUID().toString(), ZemaToolPlan.ARTICLE_PLAN_SCHEMA,
            planningPrompt, contextJson);
        if (!"completed".equals(result.event)) {
            if ("proposal".equals(result.event))
                throw new SecurityException("LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL");
            throw new IllegalStateException("LOCAL_AI_PLAN_FAILED");
        }
        String input = ZemaToolPlan.verifiedInput(toolId, result.payload);
        return engine.submit(requestId, input, false, true);
    }
}
