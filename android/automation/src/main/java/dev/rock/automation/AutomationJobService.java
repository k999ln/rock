package dev.rock.automation;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.BatteryManager;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.UserManager;
import android.provider.Settings;
import dev.rock.core.Engine;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AutomationJobService extends JobService {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final class Session {
        final AtomicBoolean stopped = new AtomicBoolean();
        volatile Engine.Ticket current;
        volatile ToolConnection connection;
        volatile Future<?> task;
    }
    private volatile Session active;
    private Engine engine() { return ((RockApplication)getApplication()).engine(); }
    @Override public boolean onStartJob(JobParameters params) {
        Session s = new Session(); active = s;
        s.task = worker.submit(() -> {
            boolean reschedule = false;
            try {
                if (!getSystemService(UserManager.class).isUserUnlocked()) return;
                int boot = Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1);
                if (boot < 0) throw new IllegalStateException("BOOT_ID_UNAVAILABLE");
                for (int i = 0; i < 8 && !s.stopped.get(); i++) {
                    boolean charging = getSystemService(BatteryManager.class).isCharging();
                    if (getSystemService(PowerManager.class).getCurrentThermalStatus() >= PowerManager.THERMAL_STATUS_SEVERE) { reschedule = true; break; }
                    s.current = engine().claim(Integer.toString(boot), SystemClock.elapsedRealtime(), charging);
                    if (s.current == null) { reschedule = !charging && !engine().paused(); break; }
                    s.connection = new ToolConnection(this);
                    if (s.stopped.get()) { engine().interrupt(s.current); break; }
                    try {
                        ToolConnection.Result result = s.connection.execute(s.current);
                        if (!s.stopped.get()) engine().finish(s.current, result.outcome, result.output, Integer.toString(boot), SystemClock.elapsedRealtime());
                    } catch (Exception e) { engine().interrupt(s.current); reschedule = true; break; }
                    finally { s.connection.cancel(); s.connection = null; s.current = null; }
                    reschedule = i == 7;
                }
            } catch (RuntimeException e) { /* Fail closed; no raw payload/error logging. UI keeps persistent state. */ }
            finally { if (!s.stopped.get()) jobFinished(params, reschedule); }
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        stop(active);
        return !engine().paused();
    }
    private void stop(Session s) {
        if (s == null) return;
        s.stopped.set(true);
        ToolConnection c = s.connection; if (c != null) c.cancel();
        Future<?> f = s.task; if (f != null) f.cancel(true);
        Engine.Ticket t = s.current; if (t != null) engine().interrupt(t);
    }
    @Override public void onDestroy() { stop(active); worker.shutdownNow(); super.onDestroy(); }
}
