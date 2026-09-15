package dev.rock.automation;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.IBinder;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.sdk.IPlatformApi;
import dev.rock.sdk.IPlatformCallback;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the generated Binder interface, installed-package identity and SQLite registry on Android. */
@RunWith(AndroidJUnit4.class)
public final class PlatformServiceIntegrationTest {
    @Test public void registersInstalledToolThroughVersionedBinder() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        CountDownLatch connected = new CountDownLatch(1);
        IPlatformApi[] api = new IPlatformApi[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                api[0] = IPlatformApi.Stub.asInterface(service); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { api[0] = null; }
        };
        Intent intent = new Intent().setComponent(new ComponentName(context, RockPlatformService.class));
        assertTrue(context.bindService(intent, connection, Context.BIND_AUTO_CREATE));
        try {
            assertTrue(connected.await(5, TimeUnit.SECONDS));
            assertEquals(1, api[0].getApiVersion());
            PackageInfo info = context.getPackageManager().getPackageInfo(
                "dev.rock.tools.article", PackageManager.GET_SIGNING_CERTIFICATES);
            String signer = hex(MessageDigest.getInstance("SHA-256")
                .digest(info.signingInfo.getApkContentsSigners()[0].toByteArray()));
            JSONObject manifest = new JSONObject()
                .put("kind", "TOOL")
                .put("componentId", "org.rockstar.tool.article")
                .put("packageName", "dev.rock.tools.article")
                .put("versionCode", info.getLongVersionCode())
                .put("apiMin", 1).put("apiMax", 1)
                .put("dataSchemaMin", 1).put("dataSchemaMax", 1)
                .put("signingDigest", signer)
                .put("permissions", new JSONArray().put("text.input").put("text.output"));
            String request = "android-test:" + UUID.randomUUID();
            CountDownLatch completed = new CountDownLatch(1);
            String[] status = new String[1];
            api[0].registerComponent(request, manifest.toString(), new IPlatformCallback.Stub() {
                @Override public void onResult(String requestId, String resultStatus, String resultId, String digest) {
                    if (request.equals(requestId)) { status[0] = resultStatus; completed.countDown(); }
                }
            });
            assertTrue(completed.await(5, TimeUnit.SECONDS));
            assertEquals("OK", status[0]);
        } finally {
            context.unbindService(connection);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) value.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }
}
