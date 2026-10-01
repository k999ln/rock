package dev.rock.automation;

import android.content.Context;
import android.os.UserHandle;
import android.os.UserManager;

/** Builds a stable per-device owner key using only public Android SDK APIs. */
final class AndroidOwner {
    private AndroidOwner() { }

    static String forUid(Context context, int uid) {
        return forHandle(context, UserHandle.getUserHandleForUid(uid));
    }

    static String current(Context context) {
        return forHandle(context, android.os.Process.myUserHandle());
    }

    private static String forHandle(Context context, UserHandle handle) {
        UserManager users = context.getSystemService(UserManager.class);
        if (users == null) throw new SecurityException("USER_SERVICE_UNAVAILABLE");
        long serial = users.getSerialNumberForUser(handle);
        if (serial < 0) throw new SecurityException("UNKNOWN_ANDROID_USER");
        return "android-user:" + serial;
    }
}
