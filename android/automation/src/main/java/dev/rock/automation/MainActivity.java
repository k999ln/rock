package dev.rock.automation;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.widget.*;
import dev.rock.core.Engine;
import dev.rock.sdk.ArticlePayload;
import org.json.JSONObject;
import java.util.*;
import java.util.concurrent.*;

/** Native diagnostic workbench, not a replacement launcher or a finished OS shell. */
public final class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout form, jobs;
    private TextView message;
    private EditText markdown, summary, paid, url, cutoff, price;
    private CheckBox consent, sample;
    private Engine engine() { return ((RockApplication)getApplication()).engine(); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this); form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        int padding = (int)(20 * getResources().getDisplayMetrics().density); form.setPadding(padding, padding, padding, padding);
        scroll.addView(form); setContentView(scroll);
        label(form, "Rock star · 自律実行の試作", 24);
        label(form, "端末内だけで出典整理→無料版を作成します。外部投稿・決済はしません。充電中にOSが実行時刻を決めます（正確な15分間隔ではありません）。", 16);
        markdown = field("原稿（Markdown）", "", true);
        summary = field("まとめ（- で始まる3〜5項目）", "", true);
        cutoff = field("無料範囲の文字数", "40", false);
        price = field("完全版の表示価格（円・課金はしません）", "500", false);
        paid = field("完全版に残る内容", "", false);
        url = field("完全版の記事URL（https://note.com/.../n/...）", "", false);
        consent = new CheckBox(this); consent.setText("この原稿と成果物を端末に保存し、2工程を自動で実行することを許可する"); form.addView(consent);
        sample = new CheckBox(this); sample.setText("サンプル検証（最初の工程の結果を確認し、次へ進めない）"); form.addView(sample);
        button(form, "仕事を保存して自動実行を予約", () -> {
            try {
                JSONObject input = new JSONObject(); input.put("markdown", markdown.getText().toString()); input.put("summary", summary.getText().toString());
                input.put("afterChars", Integer.parseInt(cutoff.getText().toString())); input.put("price", Integer.parseInt(price.getText().toString()));
                input.put("paidContents", paid.getText().toString()); input.put("noteUrl", url.getText().toString());
                String payload = input.toString(); ArticlePayload.parse(payload);
                boolean allowed = consent.isChecked(), isSample = sample.isChecked();
                perform(() -> { engine().submit(UUID.randomUUID().toString(), payload, isSample, allowed); Scheduler.schedule(this); });
            } catch (Exception e) { message.setText("入力を確認してください。文字数・価格は整数、全項目の入力が必要です。"); }
        });
        button(form, "全停止（保存した仕事は残す）", () -> perform(() -> { engine().setPaused(true); Scheduler.stop(this); }));
        button(form, "自動実行を再開", () -> perform(() -> { engine().setPaused(false); Scheduler.schedule(this); }));
        button(form, "進捗を更新", () -> perform(() -> {}));
        message = label(form, "", 16);
        jobs = new LinearLayout(this); jobs.setOrientation(LinearLayout.VERTICAL); form.addView(jobs);
        perform(() -> {});
    }
    private EditText field(String title, String initial, boolean multi) {
        label(form, title, 16); EditText input = new EditText(this); input.setText(initial); input.setTextSize(16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | (multi ? InputType.TYPE_TEXT_FLAG_MULTI_LINE : 0));
        input.setSingleLine(!multi); if (multi) input.setMinLines(3); form.addView(input); return input;
    }
    private TextView label(LinearLayout container, String text, int size) {
        TextView v = new TextView(this); v.setText(text); v.setTextSize(size); v.setPadding(0, 12, 0, 8); container.addView(v); return v;
    }
    private void button(LinearLayout container, String text, Runnable action) {
        Button b = new Button(this); b.setText(text); b.setOnClickListener(v -> action.run()); container.addView(b);
    }
    private void perform(Runnable action) {
        worker.execute(() -> {
            try {
                action.run(); boolean paused = engine().paused();
                List<Map<String,String>> workItems = engine().list(); Map<String,List<Map<String,String>>> runItems = new HashMap<>();
                for (Map<String,String> w : workItems) runItems.put(w.get("id"), engine().runs(w.get("id")));
                runOnUiThread(() -> { if (!isDestroyed()) { message.setText(paused ? "全停止中" : "予約済みの仕事は充電中に実行します。原稿・成果物はこの端末内だけに保存します。"); render(workItems, runItems); } });
            } catch (RuntimeException e) {
                runOnUiThread(() -> { if (!isDestroyed()) message.setText("処理できませんでした。保存の同意、入力内容、工程の状態、ツールの導入、端末容量を確認してください。"); });
            }
        });
    }
    private void render(List<Map<String,String>> workItems, Map<String,List<Map<String,String>>> runItems) {
        jobs.removeAllViews(); label(jobs, "仕事と確認待ち", 22);
        if (workItems.isEmpty()) label(jobs, "仕事はまだありません。", 16);
        for (Map<String,String> w : workItems) {
            String id = w.get("id"), state = w.get("state");
            label(jobs, id.substring(0, 8) + " · " + state + ("1".equals(w.get("sample")) ? " · サンプル" : ""), 18);
            for (Map<String,String> r : runItems.get(id)) label(jobs, r.get("tool") + " : " + r.get("state") + " / 試行 " + r.get("attempt") + (r.get("error") == null ? "" : " / " + r.get("error")), 16);
            if (state.equals("review") || state.equals("completed")) {
                TextView artifact = label(jobs, "", 16); artifact.setTextIsSelectable(true);
                button(jobs, "成果物を読む（長押しでコピー）", () -> worker.execute(() -> {
                    try { String output = engine().result(id); runOnUiThread(() -> artifact.setText(output)); }
                    catch (RuntimeException e) { runOnUiThread(() -> artifact.setText("成果物の整合性を確認できません。")); }
                }));
            }
            if (state.equals("review")) {
                EditText note = new EditText(this); note.setHint("本文・出典を読んで確認メモを入力"); jobs.addView(note);
                button(jobs, "本人確認して完了", () -> { String value = note.getText().toString(); perform(() -> engine().complete(id, value)); });
            }
            if (state.equals("active") && "0".equals(w.get("sample"))) button(jobs, "失敗した工程だけを再試行", () -> perform(() -> { engine().retry(id); Scheduler.schedule(this); }));
            if (state.equals("active") || state.equals("review")) button(jobs, "この仕事を中止", () -> perform(() -> engine().cancel(id)));
        }
    }
    @Override public void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
}
