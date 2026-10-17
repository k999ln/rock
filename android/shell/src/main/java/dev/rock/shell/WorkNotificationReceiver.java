package dev.rock.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** Signature-permission protected wakeup; state comes only from the existing signed Broker API. */
public final class WorkNotificationReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!"dev.rock.shell.WORK_CHANGED".equals(intent.getAction()) || !WorkNotifications.enabled(context)) return;
        String id = intent.getStringExtra("workId");
        if (id != null && !WorkPresentation.validId(id)) return;
        PendingResult pending = goAsync();
        new Thread(() -> {
            try { WorkNotifications.sync(context, new JSONObject(new ShellConnection(context).snapshot()), id, false); }
            catch (Exception unavailable) { /* No invented state or fallback notification. Reconcile on resume. */ }
            finally { pending.finish(); }
        }, "rock-work-notification").start();
    }
}
