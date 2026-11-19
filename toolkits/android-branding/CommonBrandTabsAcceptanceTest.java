package dev.rock.shell;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Owner-authorized visual test. Does not start sync, submit a job, or log in. */
@RunWith(AndroidJUnit4.class)
public final class CommonBrandTabsAcceptanceTest {
    @Test public void currentLogoAndThreeEqualDestinationsAreVisible() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var context = instrumentation.getTargetContext();
        Activity activity = instrumentation.startActivitySync(new Intent()
            .setClassName(context.getPackageName(), "dev.rock.shell.RockstarOsActivity")
            .putExtra("deviceSettings", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        instrumentation.waitForIdleSync();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try {
                View root = activity.getWindow().getDecorView();
                assertTrue("status icons remain readable on the light surface", (activity.getWindow().getInsetsController().getSystemBarsAppearance()
                    & android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS) != 0);
                ViewGroup navigation = findNavigation(root);
                assertNotNull("the common navigation is visible", navigation);
                assertTrue(navigation.isShown());
                assertEquals(3, navigation.getChildCount());
                String[] labels = {"smis", "Eve", "コミュニティー"};
                String[] paths = {"/#timeline", "/os/eve", "/#communities"};
                int width = navigation.getChildAt(0).getWidth();
                for (int i = 0; i < 3; i++) {
                    Button button = (Button) navigation.getChildAt(i);
                    assertEquals(labels[i], button.getText().toString());
                    assertEquals("os-tab:" + paths[i], button.getTag());
                    assertTrue(button.hasOnClickListeners());
                    assertTrue(button.getGlobalVisibleRect(new Rect()));
                    assertTrue("equal thirds", Math.abs(width - button.getWidth()) <= 1);
                    assertEquals(1f, ((LinearLayout.LayoutParams) button.getLayoutParams()).weight, 0f);
                }
                Bitmap logo = BitmapFactory.decodeResource(context.getResources(), R.drawable.company_mark);
                assertEquals(512, logo.getWidth()); assertEquals(512, logo.getHeight());
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                int[] pixels = new int[512 * 512]; logo.getPixels(pixels, 0, 512, 0, 0, 512, 512);
                for (int pixel : pixels) digest.update(new byte[] {(byte)(pixel >> 16), (byte)(pixel >> 8), (byte)pixel, (byte)(pixel >> 24)});
                StringBuilder hex = new StringBuilder(); for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
                assertEquals("the supplied new mark", "b48f315b387eb8bbe4c2509ecf49fe53efa06581fa65f11169a5c225c8a7eb4b", hex.toString());
            } catch (Throwable error) { failure.set(error); }
        });
        if (failure.get() != null) throw new AssertionError(failure.get());
        Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull("physical display screenshot", screenshot);
        File image = new File(context.getCacheDir(), "brand-tabs-physical.png");
        try (FileOutputStream output = new FileOutputStream(image)) { assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, output)); }
        // Leave the visible, non-dispatching preview for owner inspection.
    }
    private static ViewGroup findNavigation(View view) {
        if (view instanceof ViewGroup) {
            if ("RockstarOSの主要サービス".contentEquals(view.getContentDescription() == null ? "" : view.getContentDescription())) return (ViewGroup)view;
            ViewGroup group = (ViewGroup)view;
            for (int i = 0; i < group.getChildCount(); i++) { ViewGroup found = findNavigation(group.getChildAt(i)); if (found != null) return found; }
        }
        return null;
    }
}
