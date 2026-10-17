package dev.rock.automation;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/** A refresh hint only. No manuscript, result, authority or execution command crosses this broadcast. */
final class WorkChangeSignal {
    static void changed(Context context, String workId) {
        Intent hint = new Intent("dev.rock.shell.WORK_CHANGED")
            .setComponent(new ComponentName("dev.rock.shell", "dev.rock.shell.WorkNotificationReceiver"));
        if (workId != null) hint.putExtra("workId", workId);
        long identity = android.os.Binder.clearCallingIdentity();
        try { context.sendBroadcast(hint, "dev.rock.permission.USE_SHELL_API"); }
        catch (RuntimeException unavailable) { /* Notifications cannot roll back committed work. */ }
        finally { android.os.Binder.restoreCallingIdentity(identity); }
    }
}
