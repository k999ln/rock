package dev.rock.automation;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.RemoteException;
import dev.rock.core.Engine;
import dev.rock.localai.ILocalAiCallback;
import dev.rock.localai.ILocalAiService;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Fail-closed client for the separately packaged, locally executing LLM service. */
final class LocalAiConnection {
    static final String PACKAGE = "com.localactionassistant";
    static final String SERVICE = PACKAGE + ".RockLocalAiService";
    static final int API_VERSION = 2;
    private static final Set<String> TERMINAL_EVENTS = Set.of("proposal", "completed", "failed");
    private final Context context;
    private volatile ILocalAiService service;

    static final class Result {
        final String event;
        final String payload;
        Result(String event, String payload) { this.event = event; this.payload = payload; }
    }

    LocalAiConnection(Context context) { this.context = context; }

    String status() throws Exception {
        return withService((remote, ignoredUid) -> {
            String value = remote.getStatus();
            Engine.bounded(value);
            JSONObject status = new JSONObject(value);
            Set<String> keys = Set.of("state", "modelLoaded", "runtime", "apiVersion");
            if (status.length() != keys.size()) throw new IllegalArgumentException("INVALID_LOCAL_AI_STATUS");
            java.util.Iterator<String> names = status.keys();
            while (names.hasNext()) if (!keys.contains(names.next()))
                throw new IllegalArgumentException("INVALID_LOCAL_AI_STATUS");
            String state = status.getString("state");
            if (!Set.of("ready", "no_model", "loading", "busy", "error").contains(state)
                    || !(status.get("modelLoaded") instanceof Boolean)
                    || !"llama.rn".equals(status.getString("runtime"))
                    || status.getInt("apiVersion") != API_VERSION)
                throw new IllegalArgumentException("INVALID_LOCAL_AI_STATUS");
            return state;
        });
    }

    Result complete(String requestToken, String prompt, String contextJson) throws Exception {
        validToken(requestToken); Engine.bounded(prompt); Engine.bounded(contextJson);
        return exchange(requestToken, (remote, callback) ->
            remote.complete(requestToken, prompt, contextJson, callback));
    }

    Result plan(String requestToken, String schemaId, String prompt, String contextJson) throws Exception {
        validToken(requestToken);
        if (!dev.rock.sdk.ZemaToolPlan.ARTICLE_PLAN_SCHEMA.equals(schemaId))
            throw new IllegalArgumentException("UNSUPPORTED_PLAN_SCHEMA");
        Engine.bounded(prompt); Engine.bounded(contextJson);
        return exchange(requestToken, (remote, callback) ->
            remote.completePlan(requestToken, schemaId, prompt, contextJson, callback));
    }

    Result confirm(String requestToken, String proposalId, boolean approved) throws Exception {
        validToken(requestToken);
        if (proposalId == null || !proposalId.matches("[A-Za-z0-9_-]{1,80}"))
            throw new IllegalArgumentException("INVALID_PROPOSAL_ID");
        return exchange(requestToken, (remote, callback) ->
            remote.confirm(requestToken, proposalId, approved, callback));
    }

    void cancel(String requestToken) {
        try { validToken(requestToken); if (service != null) service.cancel(requestToken); }
        catch (IllegalArgumentException | RemoteException ignored) { }
    }

    private Result exchange(String requestToken, Request request) throws Exception {
        return withService((remote, expectedUid) -> {
            CountDownLatch finished = new CountDownLatch(1);
            AtomicReference<Result> result = new AtomicReference<>();
            StringBuilder text = new StringBuilder();
            ILocalAiCallback callback = new ILocalAiCallback.Stub() {
                @Override public void onEvent(String receivedToken, String event, String payload) {
                    if (Binder.getCallingUid() != expectedUid || !requestToken.equals(receivedToken)) return;
                    try {
                        if (event == null || payload == null) throw new IllegalArgumentException();
                        if ("token".equals(event)) {
                            if (result.get() != null) return;
                            appendBounded(text, payload);
                        } else if (TERMINAL_EVENTS.contains(event)) {
                            String body = payload;
                            if ("completed".equals(event)) {
                                body = payload.isEmpty() ? text.toString() : payload;
                                Engine.bounded(body);
                            } else Engine.bounded(body);
                            result.compareAndSet(null, new Result(event, body));
                            finished.countDown();
                        } else {
                            result.compareAndSet(null, new Result("failed", "INVALID_EVENT"));
                            finished.countDown();
                        }
                    } catch (RuntimeException error) {
                        result.compareAndSet(null, new Result("failed", "INVALID_RESPONSE"));
                        finished.countDown();
                    }
                }
            };
            request.start(remote, callback);
            if (!finished.await(90, TimeUnit.SECONDS) || result.get() == null) {
                remote.cancel(requestToken);
                throw new IllegalStateException("LOCAL_AI_INTERRUPTED");
            }
            return result.get();
        });
    }

    private synchronized <T> T withService(BoundCall<T> call) throws Exception {
        PackageManager pm = context.getPackageManager();
        int expectedUid = pm.getPackageUid(PACKAGE, 0);
        if (pm.getPackageInfo(PACKAGE, 0).getLongVersionCode() != 1)
            throw new SecurityException("UNAPPROVED_LOCAL_AI_VERSION");
        if (pm.checkSignatures(context.getPackageName(), PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_LOCAL_AI_SIGNER");
        CountDownLatch connected = new CountDownLatch(1);
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                service = ILocalAiService.Stub.asInterface(binder); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { service = null; }
            @Override public void onBindingDied(ComponentName name) { service = null; connected.countDown(); }
            @Override public void onNullBinding(ComponentName name) { connected.countDown(); }
        };
        boolean bound = context.bindService(new Intent().setComponent(new ComponentName(PACKAGE, SERVICE)),
                                            connection, Context.BIND_AUTO_CREATE);
        if (!bound) throw new IllegalStateException("LOCAL_AI_UNAVAILABLE");
        try {
            if (!connected.await(5, TimeUnit.SECONDS) || service == null)
                throw new IllegalStateException("LOCAL_AI_BIND_INTERRUPTED");
            if (service.getApiVersion() != API_VERSION)
                throw new IllegalStateException("INCOMPATIBLE_LOCAL_AI_API");
            return call.run(service, expectedUid);
        } finally {
            context.unbindService(connection); service = null;
        }
    }

    private static void validToken(String token) {
        if (token == null || !token.matches("[a-f0-9-]{36}"))
            throw new IllegalArgumentException("INVALID_REQUEST_TOKEN");
    }

    private static void appendBounded(StringBuilder output, String value) {
        if (value.getBytes(StandardCharsets.UTF_8).length > Engine.MAX_BYTES
                || output.toString().getBytes(StandardCharsets.UTF_8).length
                   + value.getBytes(StandardCharsets.UTF_8).length > Engine.MAX_BYTES)
            throw new IllegalArgumentException("INVALID_RESPONSE_SIZE");
        output.append(value);
    }

    private interface BoundCall<T> { T run(ILocalAiService remote, int expectedUid) throws Exception; }
    private interface Request { void start(ILocalAiService remote, ILocalAiCallback callback) throws RemoteException; }
}
