package dev.rock.operator.agent;

import android.app.admin.DevicePolicyManager;
import android.app.admin.SystemUpdatePolicy;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.StatFs;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

final class OperatorCommandExecutor {
    static final String[] SKY_PACKAGES = {
            "dev.rock.shell", "dev.rock.automation", "com.localactionassistant",
            "dev.rock.tools.article"
    };

    static final class Result {
        final String status;
        final String code;
        final JSONObject details;
        Result(String status, String code, JSONObject details) {
            this.status = status; this.code = code; this.details = details;
        }
    }

    private final Context context;
    private final OperatorAgentConfig config;
    private final DevicePolicyManager policy;
    private final ComponentName admin;
    private final OperatorNotifications notifications;
    private final SharedPreferences state;

    OperatorCommandExecutor(Context context, OperatorAgentConfig config) {
        this.context = context.createDeviceProtectedStorageContext();
        this.config = config;
        policy = context.getSystemService(DevicePolicyManager.class);
        admin = new ComponentName(context, OperatorDeviceAdminReceiver.class);
        notifications = new OperatorNotifications(context);
        state = this.context.getSharedPreferences("operator-state", Context.MODE_PRIVATE);
    }

    void showPreExecutionWarning(SignedOperatorCommand command) {
        if (command.action.equals("request_factory_reset") && notifications.available()) {
            notifications.factoryResetWarning(command.notBefore);
            state.edit().putString("factoryResetWarningCommandId", command.id)
                    .putLong("factoryResetWarningShownAt", System.currentTimeMillis()).apply();
        }
    }

    void clearExpiredMaintenance(long now) {
        if (state.getLong("maintenanceExpiresAt", 0) <= now) {
            state.edit().remove("maintenanceExpiresAt").apply();
            if (!state.getBoolean("lostMode", false)) notifications.clearIncident();
        }
    }

    void reconcileFactoryResetWarning(Set<String> activeCommandIds) {
        String pending = state.getString("factoryResetWarningCommandId", "");
        if (!pending.isEmpty() && !activeCommandIds.contains(pending)) {
            notifications.clearFactoryResetWarning();
            state.edit().remove("factoryResetWarningCommandId")
                    .remove("factoryResetWarningShownAt").apply();
        }
    }

    Result execute(SignedOperatorCommand command, long now) throws Exception {
        if (!policy.isDeviceOwnerApp(context.getPackageName()))
            return result("failed", "DEVICE_OWNER_REQUIRED", now);
        switch (command.action) {
            case "lock_device":
                policy.lockNow();
                return result("completed", "DEVICE_LOCKED", now);
            case "enter_lost_mode":
                if (!notifications.available()) return result("failed", "USER_NOTIFICATION_REQUIRED", now);
                state.edit().putBoolean("lostMode", true).apply();
                notifications.incident("Lost mode active",
                        "RockstarOS emergency protection is active. Contact support to recover this device.");
                policy.lockNow();
                return result("completed", "LOST_MODE_ACTIVE", now);
            case "exit_lost_mode":
                state.edit().remove("lostMode").apply();
                notifications.clearIncident();
                return result("completed", "LOST_MODE_RELEASED_USER_UNLOCK_REQUIRED", now);
            case "stop_sky_and_zema_execution":
                return suspension(SKY_PACKAGES, true, "SKY_ZEMA_SUSPENDED", now);
            case "resume_sky_and_zema_execution":
                return suspension(SKY_PACKAGES, false, "SKY_ZEMA_RESUMED", now);
            case "revoke_active_sessions":
                suspension(SKY_PACKAGES, true, "LOCAL_EXECUTION_SUSPENDED", now);
                return result("failed", "REMOTE_SESSION_REVOCATION_PENDING", now);
            case "pause_ota_installation":
                policy.setSystemUpdatePolicy(admin, SystemUpdatePolicy.createPostponeInstallPolicy());
                return result("completed", "OTA_INSTALLATION_POSTPONED", now);
            case "resume_ota_installation":
                policy.setSystemUpdatePolicy(admin, null);
                return result("completed", "OTA_INSTALLATION_RESUMED", now);
            case "quarantine_external_connections":
                if (config.quarantinePackages.isEmpty())
                    return result("failed", "QUARANTINE_ALLOWLIST_EMPTY", now);
                return suspension(config.quarantinePackages.toArray(new String[0]), true,
                        "EXTERNAL_PACKAGES_QUARANTINED", now);
            case "release_external_quarantine":
                if (config.quarantinePackages.isEmpty())
                    return result("failed", "QUARANTINE_ALLOWLIST_EMPTY", now);
                return suspension(config.quarantinePackages.toArray(new String[0]), false,
                        "EXTERNAL_QUARANTINE_RELEASED", now);
            case "collect_sanitized_diagnostics":
                return result("completed", "SANITIZED_DIAGNOSTICS_COLLECTED", now);
            case "open_limited_maintenance_session":
                if (!notifications.available()) return result("failed", "USER_NOTIFICATION_REQUIRED", now);
                long expires = Math.min(command.expiresAt, now + 900_000L);
                state.edit().putLong("maintenanceExpiresAt", expires).apply();
                notifications.incident("Limited maintenance active",
                        "A restricted support window is active until " + new java.util.Date(expires)
                                + ". It does not provide a remote shell or access to private content.");
                return result("completed", "LIMITED_MAINTENANCE_RECORDED", now);
            case "close_limited_maintenance_session":
                state.edit().remove("maintenanceExpiresAt").apply();
                if (!state.getBoolean("lostMode", false)) notifications.clearIncident();
                return result("completed", "LIMITED_MAINTENANCE_CLOSED", now);
            case "request_factory_reset":
                if (!config.factoryResetEnabled)
                    return result("failed", "FACTORY_RESET_RELEASE_GATE_DISABLED", now);
                if (!notifications.available())
                    return result("failed", "USER_NOTIFICATION_REQUIRED", now);
                if (!command.id.equals(state.getString("factoryResetWarningCommandId", ""))
                        || state.getLong("factoryResetWarningShownAt", Long.MAX_VALUE) > command.notBefore)
                    return result("failed", "FACTORY_RESET_WARNING_NOT_SHOWN", now);
                return result("completed", "FACTORY_RESET_ACCEPTED", now);
            default:
                throw new SecurityException("Action outside allowlist");
        }
    }

    void performAcceptedFactoryReset() {
        notifications.clearFactoryResetWarning();
        state.edit().remove("factoryResetWarningCommandId")
                .remove("factoryResetWarningShownAt").apply();
        policy.wipeData(0);
    }

    void showPostIncident(SignedOperatorCommand command,
                          OperatorAgentDatabase.StoredResult result) {
        if (notifications.available()) notifications.result(command.action, result.resultCode);
    }

    private Result suspension(String[] requested, boolean suspended, String success, long now)
            throws Exception {
        List<String> installed = new ArrayList<>();
        for (String packageName : requested) {
            try {
                context.getPackageManager().getPackageInfo(packageName, 0);
                installed.add(packageName);
            } catch (PackageManager.NameNotFoundException ignored) { }
        }
        if (installed.isEmpty()) return result("failed", "NO_ALLOWLISTED_PACKAGES_INSTALLED", now);
        String[] failures = policy.setPackagesSuspended(admin, installed.toArray(new String[0]), suspended);
        if (failures.length != 0) return result("failed", "PACKAGE_SUSPENSION_INCOMPLETE", now);
        return result("completed", success, now);
    }

    private Result result(String status, String code, long now) throws Exception {
        return new Result(status, code, diagnostics(now));
    }

    private JSONObject diagnostics(long now) throws Exception {
        Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int batteryStatus = battery == null ? BatteryManager.BATTERY_STATUS_UNKNOWN
                : battery.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN);
        int temperature = battery == null ? 0 : battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0);
        JSONObject versions = new JSONObject();
        String[] known = { context.getPackageName(), "dev.rock.automation", "dev.rock.shell",
                "com.localactionassistant", "dev.rock.tools.article" };
        for (String packageName : known) {
            try {
                PackageInfo info = context.getPackageManager().getPackageInfo(packageName, 0);
                versions.put(packageName, info.getLongVersionCode());
            } catch (PackageManager.NameNotFoundException ignored) { }
        }
        long maintenance = state.getLong("maintenanceExpiresAt", 0);
        return new JSONObject().put("osVersion", Build.VERSION.RELEASE)
                .put("securityPatch", Build.VERSION.SECURITY_PATCH)
                .put("batteryStatus", batteryStatus)
                .put("batteryTemperatureDeciC", temperature)
                .put("availableBytes", new StatFs(context.getFilesDir().getPath()).getAvailableBytes())
                .put("deviceOwner", policy.isDeviceOwnerApp(context.getPackageName()))
                .put("packageVersions", versions)
                .put("maintenanceExpiresAt", maintenance > now ? maintenance : JSONObject.NULL);
    }
}
