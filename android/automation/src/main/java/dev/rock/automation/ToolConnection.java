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
    private volatile ITool tool;
    private volatile LocalAiConnection local;
    private volatile String token;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    ToolConnection(Context context) { this.context = context; }
    static final class Result {
        final String outcome, output;
        Result(String outcome, String output) { this.outcome = outcome; this.output = output; }
    }
    Result execute(Engine.Ticket ticket) throws Exception {
        token = ticket.token;
        if ("local-generate@1".equals(ticket.tool) || LocalIdeaBatch.GENERATE.equals(ticket.tool)) {
            if (cancelled.get()) throw new InterruptedException();
            Engine engine = ((RockApplication) context.getApplicationContext()).engine();
            Engine.ModelProfilePin pin = engine.modelProfilePinForWork(AndroidOwner.current(context), ticket.workId);
            LocalAiConnection runtime = new LocalAiConnection(context); local = runtime;
            try {
                runtime.requireReadyForPlanning(pin);
                String task, prompt;
                if (LocalIdeaBatch.GENERATE.equals(ticket.tool)) {
                    task = "planning"; prompt = LocalIdeaBatch.prompt(ticket.input, ticket.attempt);
                } else {
                    org.json.JSONObject input = new org.json.JSONObject(ticket.input);
                    if (input.length() != 3 || !input.has("prompt")) return new Result("held", "LOCAL_REQUEST_REPLAN_REQUIRED");
                    task = input.getString("task");
                    if (!LocalWorkDraft.TASKS.contains(task)) throw new IllegalArgumentException("INVALID_LOCAL_REQUEST");
                    prompt = input.getString("prompt"); Engine.bounded(prompt);
                }
                if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                LocalAiConnection.Result result = runtime.plan(ticket.token, pin, LocalWorkDraft.SCHEMA, prompt, "[]");
                if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                runtime.requireReadyForPlanning(pin);
                if (!"completed".equals(result.event)) return new Result("held", "LOCAL_MODEL_RESPONSE_FAILED");
                String output = LocalWorkDraft.verify(task, result.payload);
                return new Result("passed", LocalIdeaBatch.GENERATE.equals(ticket.tool)
                    ? LocalIdeaBatch.append(ticket.input, output) : output);
            } catch (IllegalArgumentException | SecurityException invalid) {
                String code = invalid.getMessage();
                if (code == null || !java.util.Set.of("IDEA_BATCH_COUNT_MISMATCH", "IDEA_NUMBER_MISMATCH", "DUPLICATE_OR_INVALID_IDEA", "LOCAL_DRAFT_TASK_CHANGED", "INVALID_LOCAL_DRAFT_JSON", "INVALID_LOCAL_DRAFT_TEXT", "INVALID_LOCAL_DRAFT_WRAPPER", "INVALID_LOCAL_DRAFT_FIELDS", "INVALID_LOCAL_DRAFT_FIELD", "MODEL_PROFILE_RUNTIME_MISMATCH", "LOCAL_AI_NOT_READY").contains(code)) code = "LOCAL_DRAFT_INVALID";
                return new Result("held", code);
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
                            if (ticket.step == 0) ArticlePayload.validateIntermediate(ticket.input, output);
                        }
                        result.compareAndSet(null, new Result(outcome, output));
                    } catch (RuntimeException e) { result.compareAndSet(null, new Result("failed", "")); }
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
