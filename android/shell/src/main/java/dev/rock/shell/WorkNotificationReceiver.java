package dev.rock.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** Signature-permission protected wakeup; state comes only from the existing signed Broker API. */
public final class WorkNotificationReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!"dev.rock.shell.WORK_CHANGED".equals(intent.getAction()) || !WorkNotifications.enabled(context)) return;
        final Context application = context.getApplicationContext();
        String id = intent.getStringExtra("workId");
        if (id != null && !WorkPresentation.validId(id)) return;
        final long signal = android.os.SystemClock.elapsedRealtime();
        WorkNotifications.preferences(application).edit().putLong("lastSignalAt", signal).apply();
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                WorkNotifications.sync(application, new JSONObject(new ShellConnection(application).snapshot()), id, false);
                WorkNotifications.preferences(application).edit().putLong("lastRefreshAt", signal).putString("lastRefreshCode", "refreshed").apply();
            }
            catch (Exception unavailable) {
                // Only the exception class, never a payload, request, account or credential.
                WorkNotifications.preferences(application).edit().putLong("lastRefreshAt", signal)
                    .putString("lastRefreshCode", unavailable.getClass().getSimpleName()).apply();
            }
            finally { pending.finish(); }
        }, "rock-work-notification").start();
    }
}
