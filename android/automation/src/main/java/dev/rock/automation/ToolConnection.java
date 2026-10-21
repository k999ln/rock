package dev.rock.automation;

import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import dev.rock.core.Engine;
import dev.rock.sdk.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Only our fixed package/certificate is accepted. Third-party discovery is deliberately absent. */
final class ToolConnection {
    static final String PACKAGE = "dev.rock.tools.article";
    private final Context context;
    private final Engine engine;
    private volatile ITool tool;
    private volatile LocalAiConnection local;
    private volatile String token;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    ToolConnection(Context context,Engine engine) { this.context = context; this.engine = java.util.Objects.requireNonNull(engine); }
    static final class Result {
        final String outcome, output;
        Result(String outcome, String output) { this.outcome = outcome; this.output = output; }
    }
    Result execute(Engine.Ticket ticket) throws Exception {
        token = ticket.token;
        Engine engineForAgent=engine;
        org.json.JSONObject agentRecipe;
        try {agentRecipe=SkyAgentExecution.recipe(context,engineForAgent,ticket);}
        catch(Exception invalid){return new Result("held","AGENT_TOOL_AUTHORITY_INVALID");}
        if(dev.rock.core.AgentToolChain.INPUT.equals(ticket.tool)||dev.rock.core.AgentToolChain.SEAL.equals(ticket.tool)) {
            if(cancelled.get())throw new InterruptedException();
            try {return new Result("passed",dev.rock.core.AgentToolChain.INPUT.equals(ticket.tool)?AgentToolPayload.input(agentRecipe,ticket.input):AgentToolPayload.seal(agentRecipe,ticket.input));}
            catch(Exception invalid){return new Result("held","AGENT_TOOL_INPUT_INVALID");}
        }
        if ("local-generate@1".equals(ticket.tool) || LocalIdeaBatch.GENERATE.equals(ticket.tool)) {
            if (cancelled.get()) throw new InterruptedException();
            Engine engine = this.engine;
            Engine.ModelProfilePin pin = engine.modelProfilePinForWork(AndroidOwner.current(context), ticket.workId);
            LocalAiConnection runtime = new LocalAiConnection(context); local = runtime; String proposal = null;
            try {
                runtime.requireReadyForPlanning(pin);
                if (LocalIdeaBatch.GENERATE.equals(ticket.tool)) {
                    int humanRetries=(int)engine.events(ticket.workId).stream().filter(e -> Integer.toString(ticket.step).equals(e.get("step")) && "human_retry".equals(e.get("kind"))).count();
                    org.json.JSONObject state=LocalIdeaBatch.state(ticket.input);
                    String input=ticket.input;
                    boolean compactConsent=engine.events(ticket.workId).stream().anyMatch(e -> Integer.toString(ticket.step).equals(e.get("step")) && "human_compact_replan".equals(e.get("kind")));
                    if("local-ideas/5".equals(state.getString("kind")) && compactConsent){input=LocalIdeaBatch.compactCheckpoint(input);state=LocalIdeaBatch.state(input);}
                    if(!"local-ideas/6".equals(state.getString("kind")))return new Result("held","LOCAL_REQUEST_REPLAN_REQUIRED");
                    int remaining=Math.min(LocalIdeaBatch.BATCH_SIZE,state.getInt("target")-state.getJSONArray("ideas").length());
                    String next=input;
                    while(remaining>0) {
                        if(cancelled.get() || Thread.currentThread().isInterrupted())throw new InterruptedException();
                        int count=Math.min(LocalIdeaBatch.GENERATION_PART_SIZE,remaining);
                        // Fresh IPC token per completion; the immutable Engine ticket/lease is unchanged.
                        token=java.util.UUID.randomUUID().toString();
                        LocalAiConnection.Result part=runtime.plan(token,pin,LocalIdeaBatch.schemaForCount(count),LocalIdeaBatch.promptPart(next,ticket.attempt+3*humanRetries,count),"[]",180);
                        if(cancelled.get() || Thread.currentThread().isInterrupted())throw new InterruptedException();
                        runtime.requireReadyForPlanning(pin);
                        if(!"completed".equals(part.event)) {
                            if("IDEA_SCHEMA_COUNT_MISMATCH".equals(part.payload))throw new IllegalArgumentException("IDEA_BATCH_COUNT_MISMATCH");
                            if("INVALID_IDEA_STRING".equals(part.payload))throw new IllegalArgumentException("DUPLICATE_OR_INVALID_IDEA");
                            if("INVALID_IDEA_JSON".equals(part.payload))throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_JSON");
                            return new Result("held","LOCAL_MODEL_RESPONSE_FAILED");
                        }
                        proposal=part.payload;next=LocalIdeaBatch.appendPart(next,proposal,count);remaining-=count;
                    }
                    return new Result("passed",next);
                }
                org.json.JSONObject input = new org.json.JSONObject(ticket.input);
                if (!SkyAddonStore.validWorkInput(input)) return new Result("held", "LOCAL_REQUEST_REPLAN_REQUIRED");
                String task = input.getString("task");
                if (!LocalWorkDraft.TASKS.contains(task)) throw new IllegalArgumentException("INVALID_LOCAL_REQUEST");
                String prompt = input.getString("prompt"); Engine.bounded(prompt);
                if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                LocalAiConnection.Result result = runtime.plan(ticket.token, pin, LocalWorkDraft.SCHEMA, prompt, "[]");
                if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                runtime.requireReadyForPlanning(pin);
                if (!"completed".equals(result.event)) return new Result("held", "LOCAL_MODEL_RESPONSE_FAILED");
                proposal = result.payload;
                try {
                    String verified=LocalWorkDraft.verify(task, proposal);
                    new SkyAddonStore(context).recordTrial(pin.manifestDigest,task,ticket.workId,Engine.digest(proposal),true);
                    return new Result("passed",verified);
                } catch(IllegalArgumentException | SecurityException invalid) {
                    new SkyAddonStore(context).recordTrial(pin.manifestDigest,task,ticket.workId,Engine.digest(proposal),false);
                    throw invalid;
                }
            } catch (IllegalArgumentException | SecurityException invalid) {
                String code = invalid.getMessage();
                if (proposal != null && BuildConfig.DEBUG && ticket.workId.equals(context.getSharedPreferences("synthetic-plan-probe", Context.MODE_PRIVATE).getString("workId", null))) {
                    // Explicit instrumentation-only allowlist; one bounded private cache file, never a work artifact or log.
                    try {
                        String observation = new org.json.JSONObject().put("workId", ticket.workId).put("error", code).put("payload", proposal).toString();
                        java.nio.file.Files.write(new java.io.File(context.getCacheDir(), "synthetic-plan-probe.json").toPath(), observation.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    } catch (Exception ignored) { /* Diagnosis cannot change execution outcome. */ }
                }
                if (code == null || !java.util.Set.of("IDEA_BATCH_COUNT_MISMATCH", "IDEA_NUMBER_MISMATCH", "DUPLICATE_OR_INVALID_IDEA", "LOCAL_DRAFT_TASK_CHANGED", "INVALID_LOCAL_DRAFT_JSON", "INVALID_LOCAL_DRAFT_TEXT", "LOCAL_DRAFT_INSTRUCTION_ECHO", "INVALID_LOCAL_DRAFT_WRAPPER", "INVALID_LOCAL_DRAFT_FIELDS", "INVALID_LOCAL_DRAFT_FIELD", "MODEL_PROFILE_RUNTIME_MISMATCH", "LOCAL_AI_NOT_READY").contains(code)) code = "LOCAL_DRAFT_INVALID";
                boolean repairable=LocalIdeaBatch.GENERATE.equals(ticket.tool) && java.util.Set.of("IDEA_BATCH_COUNT_MISMATCH", "IDEA_NUMBER_MISMATCH", "DUPLICATE_OR_INVALID_IDEA", "LOCAL_DRAFT_TASK_CHANGED", "INVALID_LOCAL_DRAFT_JSON", "INVALID_LOCAL_DRAFT_TEXT", "LOCAL_DRAFT_INSTRUCTION_ECHO", "INVALID_LOCAL_DRAFT_WRAPPER", "INVALID_LOCAL_DRAFT_FIELDS", "INVALID_LOCAL_DRAFT_FIELD").contains(code);
                return new Result(repairable?"retryable_idea":"held", code);
            } catch (IllegalStateException unavailable) {
                return new Result("held", "LOCAL_AI_INTERRUPTED".equals(unavailable.getMessage()) ? "LOCAL_GENERATION_TIMED_OUT" : "LOCAL_GENERATION_UNAVAILABLE");
            } finally { local = null; }
        }
        if (LocalIdeaBatch.SEAL.equals(ticket.tool)) {
            if (cancelled.get()) throw new InterruptedException();
            return new Result("passed", LocalIdeaBatch.render(ticket.input));
        }
        if (LocalWorkDraft.VALIDATE.equals(ticket.tool)) {
            if (cancelled.get()) throw new IllegalStateException("LOCAL_TASK_CANCELLED");
            return new Result("passed", LocalWorkDraft.render(ticket.input));
        }
        if (LocalWorkDraft.SEAL.equals(ticket.tool)) {
            if (cancelled.get()) throw new IllegalStateException("LOCAL_TASK_CANCELLED");
            Engine.bounded(ticket.input); return new Result("passed", ticket.input);
        }
        PackageManager pm = context.getPackageManager();
        int uid = pm.getPackageUid(PACKAGE, 0);
        if (pm.getPackageInfo(PACKAGE, 0).getLongVersionCode() != 1)
            throw new SecurityException("UNAPPROVED_TOOL_VERSION");
        if (pm.checkSignatures(context.getPackageName(), PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_TOOL_SIGNER");
        CountDownLatch connected = new CountDownLatch(1), finished = new CountDownLatch(1);
        AtomicReference<Result> result = new AtomicReference<>(); token = ticket.token;
        ServiceConnection connection = new ServiceConnection() {
            public void onServiceConnected(ComponentName name, IBinder binder) { tool = ITool.Stub.asInterface(binder); connected.countDown(); }
            public void onServiceDisconnected(ComponentName name) { tool = null; finished.countDown(); }
            public void onBindingDied(ComponentName name) { tool = null; connected.countDown(); finished.countDown(); }
            public void onNullBinding(ComponentName name) { connected.countDown(); finished.countDown(); }
        };
        boolean bound = context.bindService(new Intent().setComponent(new ComponentName(PACKAGE, PACKAGE + ".ArticleService")), connection, Context.BIND_AUTO_CREATE);
        if (!bound) throw new IllegalStateException("TOOL_UNAVAILABLE");
        try {
            if (!connected.await(5, TimeUnit.SECONDS) || tool == null || cancelled.get()) throw new IllegalStateException("BIND_INTERRUPTED");
            if (tool.getApiVersion() != 1) throw new IllegalStateException("INCOMPATIBLE_API");
            tool.start(ticket.token, ticket.tool, ticket.input, new IToolCallback.Stub() {
                public void onResult(String receivedToken, String outcome, String output) {
                    if (Binder.getCallingUid() != uid || !ticket.token.equals(receivedToken)) return;
                    try {
                        if (!java.util.List.of("passed", "needs_review", "failed").contains(outcome)) throw new IllegalArgumentException();
                        if (outcome.equals("passed")) {
                            Engine.bounded(output);
                            if ("citations@1".equals(ticket.tool)) ArticlePayload.validateIntermediate(ticket.input, output);
                            if(agentRecipe!=null)AgentToolPayload.verifyResult(ticket.tool,ticket.input,output);
                        }
                        result.compareAndSet(null, new Result(outcome, output));
                    } catch (Exception e) { result.compareAndSet(null, new Result("failed", "")); }
                    finished.countDown();
                }
            });
            if (!finished.await(20, TimeUnit.SECONDS) || cancelled.get() || result.get() == null)
                throw new IllegalStateException("TOOL_INTERRUPTED");
            return result.get();
        } finally { cancel(); context.unbindService(connection); tool = null; token = null; }
    }
    void cancel() {
        cancelled.set(true); LocalAiConnection runtime = local;
        if (runtime != null && token != null) runtime.cancel(token);
        ITool current = tool; String currentToken = token;
        if (current != null && currentToken != null) try { current.cancel(currentToken); } catch (RemoteException ignored) { }
    }
}
