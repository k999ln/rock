package dev.rock.shell;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;

/** Generic notifications from a fresh authenticated Broker snapshot. Never executes work. */
final class WorkNotifications {
    static final String EXTRA_WORK_ID = "rock.workId";
    static final String PROGRESS = "rock.work.progress";
    static final String ATTENTION = "rock.work.attention";
    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("work_notifications", Context.MODE_PRIVATE);
    }
    static boolean enabled(Context context) {
        return preferences(context).getBoolean("enabled", false)
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            && context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }
    static synchronized void disable(Context context) {
        preferences(context).edit().putBoolean("enabled", false).remove("enableRequest").commit();
        context.getSystemService(NotificationManager.class).cancelAll();
    }
    static synchronized boolean activate(Context context, String request) {
        if (!request.equals(preferences(context).getString("enableRequest", null))) return false;
        preferences(context).edit().putBoolean("enabled", true).remove("enableRequest").commit(); return true;
    }
    static void channels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel progress = new NotificationChannel(PROGRESS, "仕事の進み具合", NotificationManager.IMPORTANCE_LOW);
        progress.setDescription("進行・停止・完了を静かにお知らせします");
        NotificationChannel attention = new NotificationChannel(ATTENTION, "確認と対応が必要な仕事", NotificationManager.IMPORTANCE_DEFAULT);
        attention.setDescription("成果の確認待ちや、進められない仕事をお知らせします");
        manager.createNotificationChannel(progress); manager.createNotificationChannel(attention);
    }
    static PendingIntent open(Context context, String workId) {
        Intent intent = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("rockstaros://work/" + workId)).putExtra(EXTRA_WORK_ID, workId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static synchronized void sync(Context context, JSONObject snapshot, String changedId, boolean baseline) {
        if (!baseline && !enabled(context)) return;
        channels(context);
        JSONArray works = snapshot.optJSONArray("works"); if (works == null) return;
        SharedPreferences saved = preferences(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (int i = 0; i < works.length(); i++) {
            JSONObject work = works.optJSONObject(i); if (work == null) continue;
            String id = work.optString("id"), state = work.optString("state");
            if (!WorkPresentation.validId(id) || (changedId != null && !changedId.equals(id))) continue;
            JSONArray runs = work.optJSONArray("runs"); int done = 0; boolean failed = false;
            if (runs != null) for (int r = 0; r < runs.length(); r++) {
                String step = runs.optJSONObject(r).optString("state");
                done += "succeeded".equals(step) ? 1 : 0;
                failed |= "failed".equals(step) || "needs_review".equals(step);
            }
            boolean paused = snapshot.optBoolean("paused");
            String stamp = state + ":" + done + ":" + failed + ":" + ("active".equals(state) && paused);
            if (baseline) { saved.edit().putString(id, stamp).apply(); continue; }
            if (stamp.equals(saved.getString(id, null))) continue;
            if ("cancelled".equals(state)) { manager.cancel(id, 1); saved.edit().putString(id, stamp).apply(); continue; }
            boolean attention = failed || "review".equals(state);
            String title = WorkPresentation.state(state, failed, paused);
            String body = failed ? "仕事を開いて、進められない工程を確認してください。"
                : "review".equals(state) ? "成果が届きました。内容を確認してください。"
                : "completed".equals(state) ? "確認した成果を、仕事からもう一度開けます。"
                : paused ? "端末の実行を停止しています。仕事は保存されています。"
                : done + " / " + (runs == null ? 0 : runs.length()) + " 工程が完了。タップして進み具合を見る";
            Notification publicVersion = new Notification.Builder(context, PROGRESS)
                .setSmallIcon(R.drawable.ic_work_notification).setContentTitle("RockstarOSの仕事").setContentText("ロックを解除して確認")
                .build();
            Notification notification = new Notification.Builder(context, attention ? ATTENTION : PROGRESS)
                .setSmallIcon(R.drawable.ic_work_notification).setContentTitle(title).setContentText(body)
                .setContentIntent(open(context, id)).setAutoCancel(true).setOnlyAlertOnce(!attention)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion)
                .setCategory(attention ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_STATUS)
                .setTimeoutAfter(24 * 60 * 60_000L).build();
            try { if (!enabled(context)) return; manager.notify(id, 1, notification); saved.edit().putString(id, stamp).apply(); }
            catch (SecurityException denied) { /* Revoked permission never changes work. */ }
        }
    }
}
