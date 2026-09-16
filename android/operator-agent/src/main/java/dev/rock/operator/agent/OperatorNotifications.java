package dev.rock.operator.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;

final class OperatorNotifications {
    private static final String CHANNEL = "avocado_emergency_protection";
    private static final int INCIDENT_ID = 9010;
    private static final int RESET_ID = 9011;
    private static final int RESULT_ID = 9012;
    private final Context context;
    private final NotificationManager manager;

    OperatorNotifications(Context context) {
        this.context = context;
        manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(
                CHANNEL, "Emergency protection", NotificationManager.IMPORTANCE_HIGH));
    }

    boolean available() { return manager.areNotificationsEnabled(); }

    void incident(String title, String text) {
        manager.notify(INCIDENT_ID, notification(title, text, true));
    }

    void factoryResetWarning(long notBefore) {
        manager.notify(RESET_ID, notification("Device reset requested",
                "An authenticated reset is scheduled after " + new java.util.Date(notBefore)
                        + ". Contact support immediately to cancel it.", true));
    }

    void clearIncident() { manager.cancel(INCIDENT_ID); }
    void clearFactoryResetWarning() { manager.cancel(RESET_ID); }
    void result(String action, String resultCode) {
        manager.notify(RESULT_ID, notification("Emergency operation recorded",
                action + " — " + resultCode, false));
    }

    private Notification notification(String title, String text, boolean ongoing) {
        return new Notification.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_warning)
                .setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
                .setOngoing(ongoing).setCategory(Notification.CATEGORY_SYSTEM)
                .setVisibility(Notification.VISIBILITY_PUBLIC).build();
    }
}
