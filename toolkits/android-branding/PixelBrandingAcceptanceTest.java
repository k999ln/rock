package dev.rock.shell;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.ViewFlipper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Owner-authorized UI-only check. No SIM, payment, model, or job is created. */
@RunWith(AndroidJUnit4.class)
public final class PixelBrandingAcceptanceTest {
    @Test public void companyBrandAndFourPagesRemainAvailableWithSetupDisabled() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var context = instrumentation.getTargetContext();
        PackageManager pm = context.getPackageManager();
        assertEquals("RockstarOS", pm.getApplicationLabel(context.getApplicationInfo()).toString());
        assertNotNull(pm.getApplicationIcon(context.getPackageName()));
        var setup = pm.getActivityInfo(new ComponentName(context, ServiceSetupActivity.class),
            PackageManager.MATCH_DISABLED_COMPONENTS);
        assertFalse("post-OS service module must remain disabled", setup.enabled);
        Intent intent = new Intent().setClassName(context.getPackageName(), MainActivity.class.getName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Activity activity = instrumentation.startActivitySync(intent);
        instrumentation.waitForIdleSync();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try {
                View root = activity.getWindow().getDecorView();
                assertTrue("exact product name must be visible", hasText(root, "RockstarOS"));
                assertTrue("the existing company image must appear in the header", hasCompanyMark(root));
                ViewFlipper pages = root.findViewWithTag("pages");
                assertNotNull(pages);
                assertEquals(4, pages.getChildCount());
                View confirm = root.findViewWithTag("home-confirm");
                if ("true".equals(InstrumentationRegistry.getArguments().getString("requireFrontend")))
                    assertNotNull("frontend candidate must include its primary confirmation", confirm);
                if (confirm != null) {
                    assertTrue("current Eve heading", hasText(root, "EVE · YOUR CREATIVE SPACE"));
                    assertFalse("old personal product name must not remain", hasText(root, "Jennifer"));
                    android.graphics.Rect bounds = new android.graphics.Rect();
                    android.graphics.Rect navigationBounds = new android.graphics.Rect();
                    assertTrue("primary confirmation is visible without scrolling", confirm.getGlobalVisibleRect(bounds));
                    assertTrue(root.findViewWithTag("nav-0").getGlobalVisibleRect(navigationBounds));
                    assertTrue("confirmation stays above bottom navigation", bounds.bottom <= navigationBounds.top);
                    assertTrue("current executor summary remains visible", root.findViewWithTag("home-execution-summary").isShown());
                    assertFalse("executor choices initially disclosed on request", root.findViewById(3100).isShown());
                    View contents = (View) root.findViewById(3100).getParent().getParent();
                    View toggle = (View) contents.getTag();
                    assertTrue(toggle.performClick());
                    assertTrue("executor choices can be opened", root.findViewById(3100).isShown());
                    assertTrue(toggle.performClick());
                    assertFalse("executor choices close again", root.findViewById(3100).isShown());
                }
                for (int index = 0; index < 4; index++) {
                    View navigation = root.findViewWithTag("nav-" + index);
                    assertNotNull(navigation);
                    assertTrue(navigation.performClick());
                    assertEquals(index, pages.getDisplayedChild());
                    assertTrue(hasCompanyMark(root));
                }
                root.findViewWithTag("nav-1").performClick();
            } catch (Throwable error) { failure.set(error); }
        });
        if (failure.get() != null) throw new AssertionError(failure.get());
    }

    private static boolean hasText(View view, String text) {
        if (view instanceof TextView && text.contentEquals(((TextView) view).getText())) return true;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++)
                if (hasText(group.getChildAt(i), text)) return true;
        }
        return false;
    }

    private static boolean hasCompanyMark(View view) {
        if (view instanceof ImageView && "avokado 会社ロゴ".contentEquals(
                view.getContentDescription() == null ? "" : view.getContentDescription()))
            return ((ImageView) view).getDrawable() != null && view.getVisibility() == View.VISIBLE;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++)
                if (hasCompanyMark(group.getChildAt(i))) return true;
        }
        return false;
    }
}
