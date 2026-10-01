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
    private volatile String token;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    ToolConnection(Context context) { this.context = context; }
    static final class Result {
        final String outcome, output;
        Result(String outcome, String output) { this.outcome = outcome; this.output = output; }
    }
    Result execute(Engine.Ticket ticket) throws Exception {
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
        cancelled.set(true); ITool current = tool; String currentToken = token;
        if (current != null && currentToken != null) try { current.cancel(currentToken); } catch (RemoteException ignored) { }
    }
}
