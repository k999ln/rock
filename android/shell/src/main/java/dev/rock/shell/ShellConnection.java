package dev.rock.shell;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;
import dev.rock.shellapi.IShellApi;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Exact-package, same-signer client for the separately packaged Platform Broker. */
final class ShellConnection {
    static final String BROKER_PACKAGE = "dev.rock.automation";
    static final String BROKER_SERVICE = BROKER_PACKAGE + ".RockShellService";
    static final int API_VERSION = 2;
    private final Context context;

    ShellConnection(Context context) { this.context = context; }

    String snapshot() throws Exception { return withService(IShellApi::snapshot); }
    String submit(String requestId, String input, boolean sample, boolean consent) throws Exception {
        return withService(api -> api.submit(requestId, input, sample, consent));
    }
    void setPaused(boolean paused) throws Exception { withService(api -> { api.setPaused(paused); return null; }); }
    String result(String workId) throws Exception { return withService(api -> api.result(workId)); }
    void complete(String workId, String note) throws Exception { withService(api -> { api.complete(workId, note); return null; }); }
    void retry(String workId) throws Exception { withService(api -> { api.retry(workId); return null; }); }
    void cancel(String workId) throws Exception { withService(api -> { api.cancel(workId); return null; }); }
    String localAiStatus() throws Exception { return withService(IShellApi::localAiStatus); }
    String submitZema(String requestId, String toolId, String prompt, String contextJson,
                      boolean consent) throws Exception {
        return withService(api -> api.submitZema(requestId, toolId, prompt, contextJson, consent));
    }

    private <T> T withService(Call<T> call) throws Exception {
        PackageManager pm = context.getPackageManager();
        if (pm.getPackageInfo(BROKER_PACKAGE, 0).getLongVersionCode() != 1)
            throw new SecurityException("UNAPPROVED_BROKER_VERSION");
        if (pm.checkSignatures(context.getPackageName(), BROKER_PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_BROKER_SIGNER");
        CountDownLatch connected = new CountDownLatch(1);
        IShellApi[] remote = new IShellApi[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                remote[0] = IShellApi.Stub.asInterface(service); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { remote[0] = null; }
            @Override public void onBindingDied(ComponentName name) { remote[0] = null; connected.countDown(); }
            @Override public void onNullBinding(ComponentName name) { connected.countDown(); }
        };
        Intent intent = new Intent().setComponent(new ComponentName(BROKER_PACKAGE, BROKER_SERVICE));
        if (!context.bindService(intent, connection, Context.BIND_AUTO_CREATE))
            throw new IllegalStateException("BROKER_UNAVAILABLE");
        try {
            if (!connected.await(5, TimeUnit.SECONDS) || remote[0] == null)
                throw new IllegalStateException("BROKER_BIND_INTERRUPTED");
            if (remote[0].getApiVersion() != API_VERSION)
                throw new IllegalStateException("INCOMPATIBLE_SHELL_API");
            return call.run(remote[0]);
        } finally {
            context.unbindService(connection);
        }
    }

    private interface Call<T> { T run(IShellApi api) throws Exception; }
}
