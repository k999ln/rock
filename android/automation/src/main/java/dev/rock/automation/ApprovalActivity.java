package dev.rock.automation;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.UserHandle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import dev.rock.core.platform.PlatformStore;
import java.util.Map;

/** Non-exported, device-credential-gated confirmation for one exact proposal. */
public final class ApprovalActivity extends Activity {
    private static final int CONFIRM_DEVICE = 701;
    private String approvalId;
    private String owner;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        approvalId = getIntent().getStringExtra(RockPlatformService.EXTRA_APPROVAL_ID);
        owner = "android-user:" + UserHandle.myUserId();
        Map<String,String> proposal;
        try { proposal = platform().approval(owner, approvalId); }
        catch (RuntimeException invalid) { finish(); return; }

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(24 * getResources().getDisplayMetrics().density);
        content.setPadding(pad, pad, pad, pad);
        TextView title = new TextView(this); title.setText("avocadoOS の承認"); title.setTextSize(24);
        TextView details = new TextView(this);
        details.setText("対象: " + proposal.get("component_id") + "\n操作: " + proposal.get("action") +
            "\n費用上限: " + proposal.get("max_cost_minor") + " (minor units)\n内容の指紋: " + proposal.get("payload_digest") +
            "\n有効期限: " + proposal.get("expires_at"));
        details.setTextIsSelectable(true); details.setPadding(0, pad, 0, pad);
        Button approve = new Button(this); approve.setText("本人確認して承認");
        Button deny = new Button(this); deny.setText("キャンセル");
        approve.setOnClickListener(this::authenticate);
        deny.setOnClickListener(view -> finish());
        content.addView(title); content.addView(details); content.addView(approve); content.addView(deny);
        setContentView(content);
    }

    private void authenticate(View ignored) {
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (keyguard == null || !keyguard.isDeviceSecure()) return;
        Intent challenge = keyguard.createConfirmDeviceCredentialIntent("avocadoOS", "この操作を承認します");
        if (challenge != null) startActivityForResult(challenge, CONFIRM_DEVICE);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CONFIRM_DEVICE && resultCode == RESULT_OK) {
            try { platform().confirmApproval(owner, approvalId, System.currentTimeMillis()); }
            catch (RuntimeException rejected) { setResult(RESULT_CANCELED); }
            finally { finish(); }
        }
    }

    private PlatformStore platform() { return ((RockApplication) getApplication()).platform(); }
}
