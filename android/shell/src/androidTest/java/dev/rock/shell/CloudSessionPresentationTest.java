package dev.rock.shell;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class CloudSessionPresentationTest {
    @Test public void settledReadbackShowsFinalAmountsWithoutExecutionOrReleaseActions() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(intent);
        try {
            instrumentation.runOnMainSync(() -> {
                try {
                    Method render = MainActivity.class.getDeclaredMethod("renderCloudA2AExecutionState", JSONObject.class);
                    render.setAccessible(true);
                    render.invoke(activity, new JSONObject().put("state", "wallet_settled")
                        .put("walletState", "SETTLED").put("settledMinor", 650).put("releasedMinor", 50)
                        .put("currency", "USD"));
                    String text = ((TextView) get(activity, "cloudA2aQuoteStatus")).getText().toString();
                    assertTrue(text.contains("精算明細を照合"));
                    assertTrue(text.contains("6.50"));
                    assertTrue(text.contains("0.50"));
                    assertEquals(View.GONE, ((View) get(activity, "cloudA2aFinalApprovalButton")).getVisibility());
                    assertEquals(View.GONE, ((View) get(activity, "cloudA2aWalletReleaseButton")).getVisibility());
                    assertEquals(View.VISIBLE, ((View) get(activity, "cloudA2aExecutionRecoveryButton")).getVisibility());

                    Method actions = MainActivity.class.getDeclaredMethod("renderCloudTaskDetailActions",
                        String.class, String.class, JSONObject.class);
                    actions.setAccessible(true);
                    for (String state : new String[]{"remote_completed", "remote_cancelled", "remote_failed", "remote_rejected"}) {
                        actions.invoke(activity, "agent-status", "same-delegation", new JSONObject()
                            .put("delegation", new JSONObject().put("state", state)));
                        LinearLayout buttons = (LinearLayout) get(activity, "cloudTaskDetailActions");
                        assertEquals(2, buttons.getChildCount());
                        assertTrue(((Button) buttons.getChildAt(1)).getText().toString().contains("同じ委任ID"));
                    }
                    render.invoke(activity, new JSONObject().put("state", "unknown").put("walletState", "SETTLED"));
                    text = ((TextView) get(activity, "cloudA2aQuoteStatus")).getText().toString();
                    assertFalse(text.contains("保持しています"));
                    assertTrue(text.contains("保存済みのWallet状態を変更せず"));
                } catch (ReflectiveOperationException | org.json.JSONException failure) {
                    throw new AssertionError(failure);
                }
            });
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    @Test public void revokedSessionClearsClaimResultsAndApprovalsButKeepsSameIdRecovery() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(intent);
        try {
            instrumentation.runOnMainSync(() -> {
                try {
                    ((EditText) get(activity, "entitlementClaimPackageInput")).setText("synthetic purchase credential");
                    ((TextView) get(activity, "cloudTaskDetailStatus")).setText("saved private result");
                    ((LinearLayout) get(activity, "cloudTaskActions")).addView(new Button(activity));
                    ((LinearLayout) get(activity, "cloudTaskDetailActions")).addView(new Button(activity));
                    set(activity, "cloudA2aVerifiedQuote", new JSONObject().put("verified", true));
                    set(activity, "cloudA2aCurrentDraft", new JSONObject().put("id", "old-account-draft"));
                    set(activity, "cloudLlmApprovalDigest", "old-account-approval");
                    set(activity, "cloudA2aRecoveryIdempotencyKey", "keep-pending-recovery");
                    ((Button) get(activity, "cloudLlmExecuteButton")).setVisibility(View.VISIBLE);
                    ((Button) get(activity, "cloudA2aFinalApprovalButton")).setVisibility(View.VISIBLE);

                    Method apply = MainActivity.class.getDeclaredMethod("applyCloudServiceHome", JSONObject.class);
                    apply.setAccessible(true);
                    apply.invoke(activity, new JSONObject().put("state", "not_linked"));

                    assertEquals("", ((EditText) get(activity, "entitlementClaimPackageInput")).getText().toString());
                    assertEquals(View.GONE, ((View) get(activity, "entitlementClaimPanel")).getVisibility());
                    assertEquals(0, ((LinearLayout) get(activity, "cloudTaskActions")).getChildCount());
                    assertEquals(0, ((LinearLayout) get(activity, "cloudTaskDetailActions")).getChildCount());
                    assertFalse(((TextView) get(activity, "cloudTaskDetailStatus")).getText().toString().contains("private result"));
                    assertNull(get(activity, "cloudA2aVerifiedQuote"));
                    assertNull(get(activity, "cloudA2aCurrentDraft"));
                    assertNull(get(activity, "cloudLlmApprovalDigest"));
                    assertEquals(View.GONE, ((View) get(activity, "cloudLlmExecuteButton")).getVisibility());
                    assertEquals(View.GONE, ((View) get(activity, "cloudA2aFinalApprovalButton")).getVisibility());
                    assertEquals("keep-pending-recovery", get(activity, "cloudA2aRecoveryIdempotencyKey"));
                    assertTrue(((TextView) get(activity, "accountLinkStatus")).getText().toString().contains("もう一度連携"));
                } catch (ReflectiveOperationException | org.json.JSONException failure) {
                    throw new AssertionError(failure);
                }
            });
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    private static Object get(MainActivity activity, String name) throws ReflectiveOperationException {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(activity);
    }

    private static void set(MainActivity activity, String name, Object value) throws ReflectiveOperationException {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(activity, value);
    }
}
