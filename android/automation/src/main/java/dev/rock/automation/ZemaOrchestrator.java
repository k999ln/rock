package dev.rock.automation;

import dev.rock.core.Engine;
import dev.rock.sdk.ZemaToolPlan;
import dev.rock.sdk.LocalWorkDraft;
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
                return submitLocked(requestId, selectionToken, prompt, contextJson, expectedModelDigest, null, consent);
            }
        } finally { android.os.Binder.restoreCallingIdentity(identity); }
    }

    private static String textInput(String task,String request,String prompt,String provenance) throws Exception {
        org.json.JSONObject input=new org.json.JSONObject().put("task",task).put("request",request).put("prompt",prompt);
        if(provenance!=null)input.put("agentProvenance",new org.json.JSONObject(provenance));
        return input.toString();
    }
    String submitAgent(String requestId,String prompt,String provenance,String modelDigest,String task,boolean consent) throws Exception {
        if(modelDigest==null||!modelDigest.matches("[a-f0-9]{64}")||!java.util.Set.of("writing","summary","translation","code","planning").contains(task))
            throw new SecurityException("AGENT_MODEL_AND_TASK_REQUIRED");
        long identity=android.os.Binder.clearCallingIdentity();
        try{synchronized(ModelProfileOperationLock.LOCK){return submitLocked(requestId,null,prompt,provenance,modelDigest,task,consent);}}
        finally{android.os.Binder.restoreCallingIdentity(identity);}
    }

    private String submitLocked(String requestId, String selectionToken, String prompt, String contextJson,
                                String expectedModelDigest, String forcedTask, boolean consent) throws Exception {
        if (!consent) throw new SecurityException("LOCAL_ARTIFACT_CONSENT_REQUIRED");
        String task = forcedTask==null?ModelSelectionPolicy.task(prompt):forcedTask;
        boolean article = "article".equals(task);
        String toolId = article ? engine.requireSkySelection(selectionToken) : LocalWorkDraft.RECIPE;
        String planningPrompt = LocalWorkDraft.prompt(task, prompt);
        Engine.bounded(prompt);
        Engine.bounded(contextJson);
        String requestDigest = Engine.digest("rockstaros-zema-plan/1\n" + toolId + "\n"
            + LocalWorkDraft.SCHEMA + "\n" + task + "\n" + planningPrompt + "\n" + contextJson
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
        if (!article) {
            int ideas = forcedTask==null?dev.rock.sdk.LocalIdeaBatch.requestedCount(prompt):0;
            String input = ideas > 0 ? dev.rock.sdk.LocalIdeaBatch.start(prompt, ideas)
                : textInput(task,prompt,planningPrompt,forcedTask==null?null:contextJson);
            LocalPlanningFence.Attempt prepared = PLANNING.begin(engine::paused, () -> { });
            try { return PLANNING.commit(prepared, engine::paused, () -> ideas > 0
                ? engine.submitPinnedIdeas(pin, requestId, input,
                    (ideas + dev.rock.sdk.LocalIdeaBatch.BATCH_SIZE - 1) / dev.rock.sdk.LocalIdeaBatch.BATCH_SIZE, true)
                : engine.submitPinnedText(pin, requestId, input, true)); }
            finally { PLANNING.finish(prepared); }
        }
        LocalAiConnection localAi = new LocalAiConnection(context);
        String token = UUID.randomUUID().toString();
        LocalPlanningFence.Attempt planning = PLANNING.begin(engine::paused, () -> localAi.cancel(token));
        try {
        localAi.requireReadyForPlanning(pin);
        LocalAiConnection.Result result = localAi.plan(
            token, pin, LocalWorkDraft.SCHEMA, planningPrompt, contextJson);
        if (!"completed".equals(result.event)) {
            if ("proposal".equals(result.event))
                throw new SecurityException("LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL");
            throw new IllegalStateException("LOCAL_AI_PLAN_FAILED");
        }
        String verified = LocalWorkDraft.verify(task, result.payload);
        String input = article ? LocalWorkDraft.articleInput(verified) : verified;
        localAi.requireReadyForPlanning(pin);
        if (article && !toolId.equals(engine.requireSkySelection(selectionToken)))
            throw new SecurityException("SKY_SELECTION_MISMATCH");
        return PLANNING.commit(planning, engine::paused,
            () -> article ? engine.submitPinned(pin, requestId, input, false, true) : engine.submitPinnedText(pin, requestId, input, true));
        } catch (Exception failure) {
            if (PLANNING.stopped(planning)) throw new IllegalStateException("LOCAL_EXECUTION_PAUSED", failure);
            throw failure;
        } finally { PLANNING.finish(planning); }
    }
}
