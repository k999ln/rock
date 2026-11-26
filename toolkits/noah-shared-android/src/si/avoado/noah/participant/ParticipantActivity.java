package si.avoado.noah.participant;

import android.app.Activity;
import android.content.Context;
import android.graphics.Typeface;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.util.regex.Pattern;

public final class ParticipantActivity extends Activity {
    private static final Pattern ID = Pattern.compile("[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    private final Handler main = new Handler(Looper.getMainLooper());
    private ParticipantSession active;
    private DeviceConditions conditions;
    private CheckBox consent;
    private EditText device, token;
    private Button start, stop;
    private TextView message;
    private Spinner duration;
    private long deadline;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        conditions = new DeviceConditions(this);
        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(24), dp(20), dp(24), dp(24));
        // Android 15 can lay content under the status/navigation bars.
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        scroll.addView(form);
        TextView title = text(form, "端末の計算を提供", 26);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        text(form, "この画面を開いている間、他の利用者が依頼した合成サンプルを分類します。提供に伴う報酬はありません。", 16);
        device = input(form, "端末ID", false);
        token = input(form, "端末トークン", true);
        text(form, "参加時間", 16);
        duration = new Spinner(this);
        duration.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"5分", "10分", "15分"}));
        form.addView(duration);
        text(form, "充電中の非従量回線で、温度と省電力状態を確認できる時に動きます。1回30件、通信本文256 KiBまで。CPU・電力・通信量を消費します。", 15);
        consent = new CheckBox(this);
        consent.setText("この端末で他の利用者の計算を行うことに同意する");
        form.addView(consent);
        start = new Button(this); start.setText("端末参加を開始"); form.addView(start);
        stop = new Button(this); stop.setText("今すぐ停止"); form.addView(stop);
        stop.setEnabled(false);
        message = text(form, "", 16);
        message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        start.setOnClickListener(view -> begin());
        stop.setOnClickListener(view -> end("この端末での処理を停止しました。"));
        setContentView(scroll);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(LinearLayout form, String content, int sp) {
        TextView v = new TextView(this); v.setText(content); v.setTextSize(sp);
        v.setPadding(0, dp(8), 0, dp(8)); form.addView(v); return v;
    }
    private EditText input(LinearLayout form, String label, boolean hidden) {
        TextView name = text(form, label, 16);
        EditText field = new EditText(this);
        field.setId(View.generateViewId()); name.setLabelFor(field.getId());
        field.setSingleLine(); field.setSaveEnabled(false);
        field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        field.setInputType(InputType.TYPE_CLASS_TEXT | (hidden ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
        field.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(36) });
        form.addView(field); return field;
    }

    private void begin() {
        if (active != null) return;
        String id = device.getText().toString(), secret = token.getText().toString();
        if (!consent.isChecked() || !ID.matcher(id).matches() || !ID.matcher(secret).matches()) {
            message.setText("登録画面の端末ID・トークンを入力し、端末参加に同意してください。"); return;
        }
        if (conditions.allowedNetwork() == null) {
            message.setText("充電、非従量のWi-Fi、省電力オフ、温度計測の各条件を確認してください。"); return;
        }
        int minutes = (duration.getSelectedItemPosition() + 1) * 5;
        deadline = SystemClock.elapsedRealtime() + minutes * 60_000L;
        // The token lives only for this visible session. No cache, background task or boot receiver.
        token.setText("");
        final ParticipantSession[] own = new ParticipantSession[1];
        own[0] = new ParticipantSession(this, conditions, id, secret, minutes,
                reason -> main.post(() -> { if (active == own[0]) end(reason); }));
        active = own[0];
        start.setEnabled(false); stop.setEnabled(true); consent.setEnabled(false); duration.setEnabled(false);
        active.start();
        message.setText("参加中です。画面を離れるか「今すぐ停止」で終了します。");
        main.postDelayed(watch, 1000);
    }

    private final Runnable watch = new Runnable() {
        public void run() {
            if (active == null) return;
            if (SystemClock.elapsedRealtime() >= deadline || conditions.allowedNetwork() == null) {
                end("参加時間または端末条件により停止しました。");
            } else main.postDelayed(this, 1000);
        }
    };

    private void end(String reason) {
        ParticipantSession previous = active;
        active = null;
        if (previous != null) previous.stop();
        main.removeCallbacks(watch);
        start.setEnabled(true); stop.setEnabled(false); consent.setEnabled(true); consent.setChecked(false);
        duration.setEnabled(true); token.setText("");
        message.setText(reason);
    }
    @Override protected void onPause() {
        if (active != null) end("画面を離れたため、端末参加を停止しました。");
        token.setText("");
        super.onPause();
    }
    @Override public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW && active != null) end("メモリを確保するため停止しました。");
    }
}
