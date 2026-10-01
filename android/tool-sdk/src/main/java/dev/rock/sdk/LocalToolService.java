package dev.rock.sdk;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.Process;
import android.os.RemoteException;
import dev.rock.core.Engine;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Fixed-author P1 service, NOT a production third-party sandbox. */
public abstract class LocalToolService extends Service {
    public static final String BROKER = "dev.rock.automation";
    private final ExecutorService worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1), new ThreadPoolExecutor.AbortPolicy());
    private String active;
    private AtomicBoolean cancelled;
    protected abstract String execute(String operation, String input, AtomicBoolean stop) throws Exception;

    private void authenticate() {
        try {
            int caller = Binder.getCallingUid();
            int expected = getPackageManager().getPackageUid(BROKER, 0);
            if (caller != expected || getPackageManager().checkSignatures(Process.myUid(), caller) != PackageManager.SIGNATURE_MATCH)
                throw new SecurityException("UNTRUSTED_BROKER");
        } catch (PackageManager.NameNotFoundException e) { throw new SecurityException("BROKER_NOT_INSTALLED"); }
    }
    private final ITool.Stub binder = new ITool.Stub() {
        @Override public int getApiVersion() { authenticate(); return 1; }
        @Override public void start(String token, String operation, String input, IToolCallback callback) {
            authenticate();
            if (token == null || !token.matches("[a-f0-9-]{36}") || callback == null) return;
            synchronized (LocalToolService.this) {
                if (active != null) { reply(callback, token, "failed", ""); return; }
                try { Engine.bounded(input); } catch (RuntimeException e) { reply(callback, token, "failed", ""); return; }
                active = token; cancelled = new AtomicBoolean(false); final AtomicBoolean stop = cancelled;
                try { worker.execute(() -> {
                    String outcome = "failed", output = "";
                    try {
                        output = execute(operation, input, stop); Engine.bounded(output);
                        if (!stop.get()) outcome = "passed";
                    } catch (Exception e) { /* Raw input and exception text must never go to logs/IPC. */ }
                    synchronized (LocalToolService.this) { active = null; cancelled = null; }
                    reply(callback, token, outcome, outcome.equals("passed") ? output : "");
                }); } catch (RejectedExecutionException e) { active = null; cancelled = null; reply(callback, token, "failed", ""); }
            }
        }
        @Override public void cancel(String token) {
            authenticate();
            synchronized (LocalToolService.this) { if (active != null && active.equals(token)) cancelled.set(true); }
        }
    };
    private static void reply(IToolCallback callback, String token, String outcome, String output) {
        try { callback.onResult(token, outcome, output); } catch (RemoteException ignored) { /* Broker recovers its lease. */ }
    }
    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public void onDestroy() {
        synchronized (this) { if (cancelled != null) cancelled.set(true); }
        worker.shutdownNow(); super.onDestroy();
    }
}
