package dev.rock.shell;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.IBinder;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Owner-initiated sync, subject to Android's dataSync lifecycle and existing grants. */
public final class EvePixelHostService extends Service {
    private static final String CHANNEL = "eve-pixel-host";
    private static final int NOTICE = 51022;
    private static final java.util.concurrent.atomic.AtomicInteger polling = new java.util.concurrent.atomic.AtomicInteger();
    private static volatile boolean running;
    private static volatile long lastConfirmedAt;
    private static volatile String message = "このPixelの同期は停止中です。端末内の成果は残っています。";
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private volatile boolean closed;

    static boolean running() { return running; }
    static boolean idle() { return !running && polling.get() == 0; }
    static void startUnavailable() { if(!running) message="Androidが同期の開始を制限しています。この設定画面を開いた状態で再開してください。既存接続と保存データは残っています。"; }
    static long lastConfirmedAt() { return lastConfirmedAt; }
    static String notice() {
        long seen = lastConfirmedAt;
        return message + (seen > 0 ? "\n最後の確認: " + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(new java.util.Date(seen)) : "");
    }

    @Override public void onCreate() {
        super.onCreate();
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL, "PixelのEve同期", NotificationManager.IMPORTANCE_LOW));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (running) return START_NOT_STICKY;
        if (!PixelHostPrerequisites.available(this) || !EveAccountSync.linked(this)) { stopSelf(); return START_NOT_STICKY; }
        message = "PixelのLinuxとアカウントの接続を確認しています。";
        startForeground(NOTICE, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        running = true;
        worker.scheduleWithFixedDelay(this::poll, 0, 15, TimeUnit.SECONDS);
        return START_NOT_STICKY;
    }

    private Notification notification() {
        Intent settings = new Intent(this, RockstarOsActivity.class).putExtra("deviceSettings", true);
        PendingIntent open = PendingIntent.getActivity(this, NOTICE, settings, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("RockstarOS · Pixel同期").setContentText(message)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).build();
    }

    private void poll() {
        polling.incrementAndGet();
        try { pollOnce(); } finally { polling.decrementAndGet(); }
    }

    private void pollOnce() {
        if (closed) return;
        String checking = "Linux接続";
        try {
            if (getSystemService(KeyguardManager.class).isDeviceLocked()) {
                message = "画面ロック中です。解除後に同じ仕事の同期を再開します。";
            } else if (!PixelHostPrerequisites.available(this) || !EveAccountSync.linked(this)) {
                message = "アカウント接続を再確認してください。保存済みデータは残っています。";
                stopSelf();
            } else {
                JSONObject snapshot = SkyLinuxBridge.request(this, new JSONObject().put("action", "status"));
                checking = "アカウント同期";
                if (!closed && EveAccountSync.syncForeground(this, snapshot, () -> !closed) && !closed) {
                    lastConfirmedAt = System.currentTimeMillis();
                    message = "Webと同じアカウントへ同期中です。Linuxの状態: " + snapshot.optString("phase", "未確認");
                }
            }
        } catch (Exception unavailable) {
            if (!closed) message = checking + "を確認できません。" + ("Linux接続".equals(checking)
                ? "TerminalでLinuxを開き、戻るで終了せずアプリを切り替えてください。接続を自動で再確認します。"
                : "通信と既存アカウントの接続を確認してください。再送で仕事を増やさず、同じ成果を照合します。");
        }
        if (!closed) getSystemService(NotificationManager.class).notify(NOTICE, notification());
    }

    @Override public void onTimeout(int startId, int foregroundServiceType) {
        message = "Androidの同期時間制限で停止しました。RockstarOSから再開できます。";
        stopSelf();
    }
    @Override public void onDestroy() {
        closed = true; running = false; worker.shutdownNow();
        if (!message.contains("制限") && !message.contains("終了") && !message.contains("再確認"))
            message = "このPixelの同期は停止中です。Linuxの仕事はEveで停止・確認してください。";
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
