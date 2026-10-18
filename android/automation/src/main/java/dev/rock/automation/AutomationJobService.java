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
    private final ConcurrentMap<Integer, Session> sessions = new ConcurrentHashMap<>();
    private Engine engine() { return ((RockApplication)getApplication()).engine(); }
    @Override public boolean onStartJob(JobParameters params) {
        Session s = new Session();
        Session previous = sessions.put(params.getJobId(), s);
        stop(previous);
        s.task = worker.submit(() -> {
            boolean reschedule = false, continuation = false;
            try {
                if (!getSystemService(UserManager.class).isUserUnlocked()) return;
                int boot = Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1);
                if (boot < 0) throw new IllegalStateException("BOOT_ID_UNAVAILABLE");
                for (int i = 0; i < 2 && !s.stopped.get(); i++) {
                    boolean charging = getSystemService(BatteryManager.class).isCharging();
                    if (getSystemService(PowerManager.class).getCurrentThermalStatus() >= PowerManager.THERMAL_STATUS_SEVERE) { reschedule = true; break; }
                    s.current = engine().claim(Integer.toString(boot), SystemClock.elapsedRealtime(), charging);
                    if (s.current == null) { reschedule = !charging && !engine().paused(); break; }
                    WorkChangeSignal.changed(this, s.current.workId);
                    s.connection = new ToolConnection(this,engine());
                    if (s.stopped.get()) { engine().interrupt(s.current); break; }
                    try {
                        ToolConnection.Result result = s.connection.execute(s.current);
                        if (!s.stopped.get()) {
                            if ("retryable_idea".equals(result.outcome)) engine().retryRejectedIdea(s.current,result.output,Integer.toString(boot),SystemClock.elapsedRealtime());
                            else if ("held".equals(result.outcome)) engine().hold(s.current, result.output);
                            else SkyAgentExecution.finish(this,engine(),s.current,result.outcome,result.output,Integer.toString(boot),SystemClock.elapsedRealtime());
                        }
                    } catch (Exception e) { engine().interrupt(s.current); reschedule = true; break; }
                    finally { WorkChangeSignal.changed(this, s.current.workId); s.connection.cancel(); s.connection = null; s.current = null; }
                    continuation = i == 1;
                }
            } catch (RuntimeException e) { /* Fail closed; no raw payload/error logging. UI keeps persistent state. */ }
            finally {
                sessions.remove(params.getJobId(), s);
                if (!s.stopped.get()) {
                    jobFinished(params, reschedule);
                    if(continuation)Scheduler.continueWork(this,params.getJobId());
                }
            }
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        stop(sessions.remove(params.getJobId()));
        return !engine().paused();
    }
    private void stop(Session s) {
        if (s == null) return;
        s.stopped.set(true);
        ToolConnection c = s.connection; if (c != null) c.cancel();
        Future<?> f = s.task; if (f != null) f.cancel(true);
        Engine.Ticket t = s.current; if (t != null) engine().interrupt(t);
    }
    @Override public void onDestroy() {
        for (Session s : sessions.values()) stop(s);
        sessions.clear(); worker.shutdownNow(); super.onDestroy();
    }
}
