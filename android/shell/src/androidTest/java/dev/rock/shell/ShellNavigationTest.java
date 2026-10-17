package dev.rock.shell;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.ViewFlipper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** UI-only acceptance: never resets the Broker, submits work, or approves spending. */
@RunWith(AndroidJUnit4.class)
public final class ShellNavigationTest {
    private Instrumentation instrumentation;
    private MainActivity activity;
    private ShellConnection broker;
    private int initialWorkCount;
    private String initialSelection;

    @Before public void open() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        broker = new ShellConnection(instrumentation.getTargetContext());
        initialWorkCount = new JSONObject(broker.snapshot()).getInt("totalWorkCount");
        initialSelection = broker.skySelection();
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity = (MainActivity) instrumentation.startActivitySync(intent);
        instrumentation.waitForIdleSync();
    }

    @After public void closeWithoutChangingBroker() throws Exception {
        if (activity != null) {
            instrumentation.runOnMainSync(() -> activity.finish());
            instrumentation.waitForIdleSync();
        }
        assertEquals(initialWorkCount, new JSONObject(broker.snapshot()).getInt("totalWorkCount"));
        assertEquals(initialSelection, broker.skySelection());
    }

    @Test public void tabsKeepDraftsAndExposeOnlyTheirOwnPage() {
        instrumentation.runOnMainSync(() -> {
            EditText home = tagged("home-prompt");
            home.setText("Synthetic navigation draft");
            for (int tab = 1; tab < 4; tab++) {
                tagged("nav-" + tab).performClick();
                assertEquals(tab, ((ViewFlipper) tagged("pages")).getDisplayedChild());
                assertTrue(tagged("nav-" + tab).isSelected());
                assertFalse(home.isShown());
            }
            tagged("nav-0").performClick();
            assertTrue(home.isShown());
            assertEquals("Synthetic navigation draft", home.getText().toString());
        });
    }

    @Test public void preparingDraftDoesNotApproveOrSubmitWork() {
        instrumentation.runOnMainSync(() -> {
            ((EditText) tagged("home-prompt")).setText("Synthetic handoff draft");
            // Even a previously checked consent must not carry to a new Home draft.
            ((CheckBox) tagged("work-consent")).setChecked(true);
            findText(activity.getWindow().getDecorView(), "依頼を準備する").performClick();
            assertEquals(2, ((ViewFlipper) tagged("pages")).getDisplayedChild());
            assertEquals("Synthetic handoff draft", ((EditText) tagged("work-prompt")).getText().toString());
            assertFalse(((CheckBox) tagged("work-consent")).isChecked());
            tagged("nav-1").performClick();
            tagged("nav-2").performClick();
            assertEquals("Synthetic handoff draft", ((EditText) tagged("work-prompt")).getText().toString());
        });
    }

    @Test public void emptyHomeDraftStaysOnHome() {
        instrumentation.runOnMainSync(() -> {
            ((EditText) tagged("home-prompt")).setText("  ");
            findText(activity.getWindow().getDecorView(), "依頼を準備する").performClick();
            assertEquals(0, ((ViewFlipper) tagged("pages")).getDisplayedChild());
            assertNotNull(((EditText) tagged("home-prompt")).getError());
            assertEquals("", ((EditText) tagged("work-prompt")).getText().toString());
        });
    }

    @Test public void existingWorkDraftRequiresConfirmationBeforeReplacement() {
        instrumentation.runOnMainSync(() -> {
            ((EditText) tagged("work-prompt")).setText("Existing synthetic draft");
            ((EditText) tagged("home-prompt")).setText("Replacement synthetic draft");
            findText(activity.getWindow().getDecorView(), "依頼を準備する").performClick();
            assertEquals(0, ((ViewFlipper) tagged("pages")).getDisplayedChild());
            assertEquals("Existing synthetic draft", ((EditText) tagged("work-prompt")).getText().toString());
            assertFalse(((CheckBox) tagged("work-consent")).isChecked());
        });
    }

    @Test public void readOnlyBrokerStateForUpdateAcceptance() throws Exception {
        JSONObject snapshot = new JSONObject(broker.snapshot());
        JSONObject selected = new JSONObject(broker.skySelection());
        JSONObject report = new JSONObject()
            .put("workCount", snapshot.getInt("totalWorkCount"))
            .put("selectionStatus", selected.optString("status"))
            .put("selectedTool", selected.optString("toolId"))
            .put("selectionRevision", selected.optInt("revision"))
            .put("accountState", new JSONObject(broker.rockstarDeviceLinkStatus()).optString("state"))
            .put("localAiState", broker.localAiStatus());
        JSONObject capabilities = snapshot.getJSONObject("deviceCapabilities");
        JSONObject profile = capabilities.optJSONObject("deviceProfile");
        report.put("capabilityDiagnostics", new JSONObject()
            .put("protocolVersion", capabilities.optInt("protocolVersion"))
            .put("scope", capabilities.optString("scope"))
            .put("ageMs", android.os.SystemClock.elapsedRealtime() - capabilities.optLong("observedAtElapsedMs"))
            .put("validityMs", capabilities.optLong("expiresAtElapsedMs") - capabilities.optLong("observedAtElapsedMs"))
            .put("profileVersion", profile == null ? -1 : profile.optInt("version"))
            .put("profileSource", profile == null ? "" : profile.optString("source"))
            .put("deliveryMode", profile == null ? "" : profile.optString("deliveryMode"))
            .put("localInference", profile == null ? null : profile.optJSONObject("localInferenceObservation")));
        android.os.Bundle result = new android.os.Bundle();
        result.putString("stream", "\nROCK_SHELL_STATE=" + report + "\n");
        instrumentation.sendStatus(0, result);
        // Optional evidence capture, without submitting work or opening the browser.
        if ("true".equals(InstrumentationRegistry.getArguments().getString("rockCaptureUi"))) {
            for (int page = 0; page < 4; page++) {
                final int capturedPage = page;
                instrumentation.runOnMainSync(() -> tagged("nav-" + capturedPage).performClick());
                instrumentation.waitForIdleSync();
                instrumentation.getUiAutomation().waitForIdle(200, 3000);
                android.graphics.Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
                assertNotNull("Physical UI screenshot", screenshot);
                java.io.File file = new java.io.File(instrumentation.getTargetContext().getCacheDir(),
                    "unified-page-" + page + ".png");
                try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) {
                    assertTrue(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
                } finally { screenshot.recycle(); }
            }
        }
    }

    @Test public void runtimeVersionAndModelStateMustMatchTheCurrentContract() throws Exception {
        JSONObject observation = new JSONObject()
            .put("modelProfileIdentity", "not_reported")
            .put("trustBasis", "approved_package_signature_and_binder_api")
            .put("runtime", "llama.rn").put("apiVersion", 4)
            .put("state", "no_model").put("modelLoaded", false);
        assertTrue(MainActivity.validLocalInferenceObservation(observation));
        observation.put("apiVersion", 2);
        assertFalse(MainActivity.validLocalInferenceObservation(observation));
        observation.put("apiVersion", 5);
        assertFalse(MainActivity.validLocalInferenceObservation(observation));
        observation.put("apiVersion", 4).put("state", "ready");
        assertFalse(MainActivity.validLocalInferenceObservation(observation));
        observation.put("modelLoaded", true);
        assertTrue(MainActivity.validLocalInferenceObservation(observation));
        observation.put("trustBasis", "self_reported");
        assertFalse(MainActivity.validLocalInferenceObservation(observation));
    }

    @Test public void freshBrokerCapabilitiesAreDisplayedOnTheDevice() {
        final String[] text = {""};
        long deadline = android.os.SystemClock.elapsedRealtime() + 10_000;
        do {
            instrumentation.runOnMainSync(() -> text[0] = ((TextView) tagged("device-capability-status")).getText().toString());
            if (text[0].startsWith("端末:")) break;
            android.os.SystemClock.sleep(100);
        } while (android.os.SystemClock.elapsedRealtime() < deadline);
        assertTrue(text[0], text[0].startsWith("端末:"));
        assertTrue(text[0], text[0].contains("native OS適合は未評価"));
    }

    @SuppressWarnings("unchecked") private <T extends View> T tagged(String tag) {
        T view = activity.getWindow().getDecorView().findViewWithTag(tag);
        assertNotNull(tag, view); return view;
    }
    private View findText(View root, String text) {
        if (root instanceof TextView && text.contentEquals(((TextView) root).getText())) return root;
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = findText(group.getChildAt(i), text);
                if (found != null) return found;
            }
        }
        return null;
    }
}
