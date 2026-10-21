package dev.rock.shell;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telephony.euicc.DownloadableSubscription;
import android.telephony.euicc.EuiccManager;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.UUID;

/** Optional post-OS module. Local eSIM success never grants cloud access or proves payment. */
public final class ServiceSetupActivity extends Activity {
    static final String STORE = "rockstar_service_setup";
    static final String CALLBACK = "dev.rock.shell.SERVICE_SETUP_ESIM_RESULT";
    private TextView status;
    private EditText code;
    private Intent resolution;
    private String displayedState;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (!prefs().getString("state", "not_started").equals(displayedState)) renderState();
            handler.postDelayed(this, 750);
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (!getResources().getBoolean(R.bool.rockstar_service_setup_enabled) || validOrigin() == null) { finish(); return; }
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(28, 32, 28, 24);
        TextView title = new TextView(this); title.setText("Sky・Eveの利用開始"); title.setTextSize(24); layout.addView(title);
        status = new TextView(this); layout.addView(status);
        TextView notice = new TextView(this);
        notice.setText("eSIMを追加した後に料金・契約・支払い準備・専用Linuxを確認します。追加だけで課金やAgent実行を承認しません。"); layout.addView(notice);
        code = new EditText(this); code.setHint("発行元から受け取ったeSIM追加コード");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        code.setSaveEnabled(false); layout.addView(code);
        String supplied = getIntent().getStringExtra("activationCode");
        if (supplied != null) { code.setText(supplied); getIntent().removeExtra("activationCode"); }
        Button add = new Button(this); add.setText("eSIMの追加・有効化へ進む");
        add.setOnClickListener(v -> addProfile()); layout.addView(add);
        Button resolve = new Button(this); resolve.setText("Androidの追加確認を開く");
        resolve.setOnClickListener(v -> resolve()); layout.addView(resolve);
        Button manage = new Button(this); manage.setText("端末のeSIM設定を確認する");
        manage.setOnClickListener(v -> {
            try { startActivity(new Intent(EuiccManager.ACTION_MANAGE_EMBEDDED_SUBSCRIPTIONS)); }
            catch (RuntimeException error) { status.setText("この端末ではeSIM設定を開けません。設定アプリで確認してください。"); }
        }); layout.addView(manage);
        Button next = new Button(this); next.setText("料金・契約と利用開始を確認する");
        next.setOnClickListener(v -> openSetup()); layout.addView(next);
        setContentView(layout);
    }
    private SharedPreferences prefs() { return getSharedPreferences(STORE, MODE_PRIVATE); }
    private String validOrigin() {
        try {
            Uri uri = Uri.parse(getString(R.string.rockstar_service_setup_origin));
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null ||
                uri.getQuery() != null || uri.getFragment() != null ||
                (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) return null;
            return "https://" + uri.getEncodedAuthority();
        } catch (RuntimeException invalid) { return null; }
    }
    private PendingIntent callback(String id) {
        Intent intent = new Intent(this, ProfileResultReceiver.class).setAction(CALLBACK)
            .setData(Uri.parse("rockstar-service-setup://result/" + id)).putExtra("requestId", id);
        return PendingIntent.getBroadcast(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }
    // Lint cannot express the carrier-privilege alternative. The explicit runtime
    // gate below and Android's own enforcement are both retained; no privileged
    // telephony permission is requested by this unprivileged Shell.
    @android.annotation.SuppressLint("MissingPermission")
    private void addProfile() {
        if (prefs().contains("requestId")) {
            status.setText("追加済み・進行中・結果不明の操作を再送しません。端末の設定と利用開始画面で照合してください。"); return;
        }
        String activationCode = code.getText().toString();
        if (!activationCode.startsWith("LPA:1$") || activationCode.length() > 4096 ||
            activationCode.codePoints().anyMatch(c -> c < 32 || c == 127)) {
            status.setText("発行元のeSIM追加コードを確認してください。"); return;
        }
        EuiccManager manager = getSystemService(EuiccManager.class);
        if (manager == null || !manager.isEnabled()) { status.setText("この端末ではeSIMの追加が現在利用できません。"); return; }
        android.telephony.TelephonyManager telephony = getSystemService(android.telephony.TelephonyManager.class);
        boolean systemAuthority = checkSelfPermission("android.permission.WRITE_EMBEDDED_SUBSCRIPTIONS")
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean carrierAuthority = telephony != null && telephony.hasCarrierPrivileges();
        if (!systemAuthority && !carrierAuthority) {
            code.setText("");
            status.setText("このアプリには直接追加する権限がありません。端末または発行元の追加画面で手続きし、利用権を照合してください。");
            try { startActivity(new Intent(EuiccManager.ACTION_MANAGE_EMBEDDED_SUBSCRIPTIONS)); }
            catch (RuntimeException unavailable) { status.setText("設定アプリのSIM追加から手続きしてください。追加や利用権はまだ確認されていません。"); }
            return;
        }
        String id = UUID.randomUUID().toString();
        if (!prefs().edit().putString("requestId", id).putString("state", "pending").commit()) {
            status.setText("手続きの保存に失敗しました。eSIMの追加は開始していません。"); return;
        }
        try {
            manager.downloadSubscription(DownloadableSubscription.forActivationCode(activationCode), true, callback(id));
            code.setText(""); status.setText("Androidの追加結果を待っています。OSが確認を求めた場合は内容を確認してください。");
        } catch (RuntimeException failed) {
            code.setText(""); prefs().edit().putString("state", "unknown").apply();
            status.setText("追加の結果を確認できません。自動再送せず、端末設定で照合してください。");
        }
    }
    private void resolve() {
        if (resolution == null) { status.setText("追加の確認情報がありません。端末設定で現在の状態を確認してください。"); return; }
        Intent result = resolution; resolution = null;
        try { getSystemService(EuiccManager.class).startResolutionActivity(this, 41, result, callback(prefs().getString("requestId", ""))); }
        catch (Exception unavailable) { status.setText("追加確認を開けません。端末設定で照合してください。"); }
    }
    @Override protected void onResume() {
        super.onResume(); if (status == null) return;
        renderState(); handler.postDelayed(refresh, 750);
    }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
    private void renderState() {
        String state = prefs().getString("state", "not_started");
        displayedState = state;
        if ("added".equals(state)) {
            status.setText("端末から追加成功の通知を受けました。サービス利用権と支払いはサーバーで別に確認します。");
            if (!prefs().getBoolean("opened", false)) { prefs().edit().putBoolean("opened", true).apply(); openSetup(); }
        } else if ("resolution_required".equals(state)) {
            // The resolution PendingIntent is deliberately not serialized. A process loss requires reconciliation.
            resolution = ProfileResultReceiver.takeResolution();
            status.setText(resolution == null ? "追加確認を復元できません。端末設定で照合してください。" : "Androidの追加確認を開いてください。");
        } else {
            String label = "pending".equals(state) ? "Androidの追加結果待ち" : "unknown".equals(state) ? "結果未確認"
                : "failed".equals(state) ? "追加失敗" : "まだ開始していません";
            status.setText(label + "。端末設定とサービスの利用権を別々に確認します。");
        }
    }
    private void openSetup() {
        String origin = validOrigin(); if (origin == null) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(origin + "/connect/service"))); }
        catch (RuntimeException unavailable) { status.setText("利用開始画面を開けません。対応ブラウザを確認してください。"); }
    }
    public static final class ProfileResultReceiver extends BroadcastReceiver {
        private static Intent pendingResolution;
        static synchronized Intent takeResolution() { Intent value = pendingResolution; pendingResolution = null; return value; }
        @Override public void onReceive(Context context, Intent intent) {
            if (!context.getResources().getBoolean(R.bool.rockstar_service_setup_enabled) || !CALLBACK.equals(intent.getAction())) return;
            SharedPreferences prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
            String id = prefs.getString("requestId", null);
            if (id == null || !id.equals(intent.getStringExtra("requestId"))) return;
            int result = getResultCode();
            String state = result == EuiccManager.EMBEDDED_SUBSCRIPTION_RESULT_OK ? "added"
                : result == EuiccManager.EMBEDDED_SUBSCRIPTION_RESULT_RESOLVABLE_ERROR ? "resolution_required" : "failed";
            if ("resolution_required".equals(state)) synchronized (ProfileResultReceiver.class) { pendingResolution = intent; }
            prefs.edit().putString("state", state).apply();
            // No background activity launch, no cloud entitlement, no storage of SIM identifiers or activation codes.
        }
    }
}
