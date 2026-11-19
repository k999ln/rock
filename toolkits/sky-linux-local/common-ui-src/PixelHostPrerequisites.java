package dev.rock.shell;

import android.content.Context;
import java.security.KeyStore;

/** Read-only prerequisite check: a UI launch is never a pairing/key enrollment. */
final class PixelHostPrerequisites {
    static boolean available(Context context) {
        if (!"https://avoado.si".equals(EveAccountSync.endpoint(context))) return false;
        if (!SkyLinuxBridge.paired(context)) return false;
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            return store.containsAlias("sky-linux-bridge-ec-v1") && store.containsAlias("eve-account-session-aes-v1");
        } catch (Exception unavailable) { return false; }
    }
}
