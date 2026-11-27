package si.avoado.noah.participant;

import android.content.*;
import android.os.*;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** One prepared renderer accepts exactly one job. Closing this connection destroys its host. */
final class EveAgentClient implements AutoCloseable {
    private final Context context;
    private final CountDownLatch prepared = new CountDownLatch(1), finished = new CountDownLatch(1);
    private volatile boolean ready;
    private volatile String result;
    private volatile Messenger service;
    private final Messenger reply = new Messenger(new Handler(Looper.getMainLooper(), message -> {
        if (message.what == EveAgentService.PREPARE) { ready = true; prepared.countDown(); }
        else if (message.what == EveAgentService.RUN) { result = message.getData().getString("result"); finished.countDown(); }
        else { ready = false; prepared.countDown(); finished.countDown(); }
        return true;
    }));
    private final ServiceConnection binding = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = new Messenger(binder);
            try { send(EveAgentService.PREPARE, null); }
            catch (Exception e) { prepared.countDown(); }
        }
        @Override public void onServiceDisconnected(ComponentName name) { disconnected(); }
        @Override public void onBindingDied(ComponentName name) { disconnected(); }
        @Override public void onNullBinding(ComponentName name) { disconnected(); }
    };
    private boolean bound;
    EveAgentClient(Context context) { this.context = context; }

    private void disconnected() { ready = false; service = null; prepared.countDown(); finished.countDown(); }

    private void send(int type, JSONObject recipe) throws Exception {
        Messenger target = service;
        if (target == null) throw new IOException("renderer closed");
        Message m = Message.obtain(null, type);
        m.replyTo = reply;
        if (recipe != null) m.getData().putString("recipe", recipe.toString());
        target.send(m);
    }

    boolean prepare() throws InterruptedException {
        bound = context.bindService(new Intent(context, EveAgentService.class), binding, Context.BIND_AUTO_CREATE);
        return bound && prepared.await(8, TimeUnit.SECONDS) && ready;
    }
    JSONObject run(JSONObject recipe) throws Exception {
        if (!ready) throw new IOException("renderer unavailable");
        send(EveAgentService.RUN, recipe);
        if (!finished.await(750, TimeUnit.MILLISECONDS) || result == null) throw new IOException("render failed");
        return new JSONObject(result);
    }
    @Override public void close() {
        ready = false;
        if (bound) { context.unbindService(binding); bound = false; }
    }
}
