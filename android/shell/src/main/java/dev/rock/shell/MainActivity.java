package dev.rock.shell;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Unprivileged avocadoOS shell. Persistent work and execution remain in the Platform Broker. */
public final class MainActivity extends Activity {
    private static final String ARTICLE_TOOL = "article-preparation@1";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout form, jobs;
    private TextView message, skyStatus;
    private EditText zemaPrompt, markdown, summary, paid, url, cutoff, price;
    private CheckBox zemaConsent, consent, sample;
    private volatile String skySelectionToken;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this); form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        int padding = (int)(20 * getResources().getDisplayMetrics().density); form.setPadding(padding, padding, padding, padding);
        scroll.addView(form); setContentView(scroll);
        label(form, "avocadoOS · Sky → Zema", 24);
        label(form, "Sky", 22);
        label(form, "Toolの選択は端末内Brokerへ保存され、アプリや端末の再起動後も同じ選択を確認できます。", 16);
        skyStatus = label(form, "Skyの選択を確認中…", 16);
        button(form, "出典整理→無料記事を選択", () -> perform(connection -> {
            connection.selectSkyTool(ARTICLE_TOOL); return null;
        }));
        label(form, "Zema", 22);
        label(form, "Zemaが端末内AIで入力を組み立て、Skyで選択済みのToolだけを実行します。外部投稿・決済はしません。", 16);
        zemaPrompt = field("Zemaへの依頼", "", true);
        zemaConsent = new CheckBox(this); zemaConsent.setText("依頼を端末内AIで計画し、選択済みToolの仕事として保存することを許可する"); form.addView(zemaConsent);
        message = label(form, "", 16);
        button(form, "Zemaに依頼して仕事を開始", this::submitZema);
        button(form, "ローカルAI接続を確認", this::checkLocalAi);
        label(form, "手動入力（開発用）", 22);
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
                String payload = input.toString(); boolean allowed = consent.isChecked(), isSample = sample.isChecked();
                perform(connection -> connection.submit(UUID.randomUUID().toString(), payload, isSample, allowed));
            } catch (Exception error) { message.setText("入力を確認してください。文字数・価格は整数、全項目の入力が必要です。"); }
        });
        button(form, "全停止（保存した仕事は残す）", () -> perform(connection -> { connection.setPaused(true); return null; }));
        button(form, "自動実行を再開", () -> perform(connection -> { connection.setPaused(false); return null; }));
        button(form, "進捗を更新", () -> perform(connection -> null));
        jobs = new LinearLayout(this); jobs.setOrientation(LinearLayout.VERTICAL); form.addView(jobs);
        perform(connection -> null);
    }

    private EditText field(String title, String initial, boolean multi) {
        label(form, title, 16); EditText input = new EditText(this); input.setText(initial); input.setTextSize(16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | (multi ? InputType.TYPE_TEXT_FLAG_MULTI_LINE : 0));
        input.setSingleLine(!multi); if (multi) input.setMinLines(3); form.addView(input); return input;
    }
    private TextView label(LinearLayout container, String text, int size) {
        TextView value = new TextView(this); value.setText(text); value.setTextSize(size); value.setPadding(0, 12, 0, 8); container.addView(value); return value;
    }
    private void button(LinearLayout container, String text, Runnable action) {
        Button value = new Button(this); value.setText(text); value.setOnClickListener(view -> action.run()); container.addView(value);
    }

    private void perform(Action action) {
        worker.execute(() -> {
            try {
                ShellConnection connection = new ShellConnection(this);
                action.run(connection);
                JSONObject snapshot = new JSONObject(connection.snapshot());
                JSONObject selection = new JSONObject(connection.skySelection());
                boolean paused = snapshot.getBoolean("paused");
                JSONArray workItems = snapshot.getJSONArray("works");
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        applySkySelection(selection);
                        message.setText(paused ? "全停止中" : "予約済みの仕事は充電中に実行します。原稿・成果物はBroker側だけに保存します。");
                        render(workItems);
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> { if (!isDestroyed()) message.setText("処理できませんでした。Broker、署名、保存同意、入力内容、工程状態を確認してください。"); });
            }
        });
    }

    private void checkLocalAi() {
        worker.execute(() -> {
            String status;
            try { status = "ローカルAI: " + new ShellConnection(this).localAiStatus(); }
            catch (Exception error) { status = "ローカルAI: 未接続（アプリ、モデル、署名、APIを確認）"; }
            String result = status;
            runOnUiThread(() -> { if (!isDestroyed()) message.setText(result); });
        });
    }

    private void submitZema() {
        String prompt = zemaPrompt.getText().toString();
        String selectionToken = skySelectionToken;
        boolean allowed = zemaConsent.isChecked();
        if (prompt.trim().isEmpty()) { message.setText("Zemaへの依頼を入力してください。"); return; }
        if (selectionToken == null) { message.setText("先にSkyで使用するToolを選択してください。"); return; }
        message.setText("Zemaが端末内で計画しています…");
        worker.execute(() -> {
            try {
                ShellConnection connection = new ShellConnection(this);
                JSONObject response = new JSONObject(connection.submitZema(
                    UUID.randomUUID().toString(), selectionToken, prompt, "[]", allowed));
                JSONObject snapshot = new JSONObject(connection.snapshot());
                JSONArray workItems = snapshot.getJSONArray("works");
                String status = response.getString("status");
                String workId = response.isNull("workId") ? null : response.getString("workId");
                String code = response.isNull("code") ? null : response.getString("code");
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        if ("queued".equals(status) && workId != null) {
                            message.setText("Zemaが仕事を保存しました: " + workId.substring(0, 8));
                        } else {
                            message.setText(zemaBlockedMessage(code));
                        }
                        render(workItems);
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> { if (!isDestroyed())
                    message.setText("Zemaを開始できません。Local AIのモデル、署名、同意、依頼内容を確認してください。"); });
            }
        });
    }

    private static String zemaBlockedMessage(String code) {
        if ("DENIED".equals(code)) return "開始していません。保存への同意を確認してください。";
        if ("SKY_SELECTION_REQUIRED".equals(code)) return "開始していません。SkyのTool選択を更新してください。";
        if ("INVALID_PLAN".equals(code)) return "開始していません。端末内AIの計画が安全確認を通りませんでした。";
        return "開始していません。Local AIのアプリ、モデル、署名、APIを確認してください。";
    }

    private void applySkySelection(JSONObject selection) {
        if ("selected".equals(selection.optString("status"))
                && ARTICLE_TOOL.equals(selection.optString("toolId"))) {
            skySelectionToken = selection.optString("selectionToken", null);
            skyStatus.setText("選択済み: 出典整理→無料記事 · revision " + selection.optInt("revision"));
        } else {
            skySelectionToken = null;
            skyStatus.setText("未選択です。使用するToolを選んでください。");
        }
    }

    private void render(JSONArray workItems) {
        jobs.removeAllViews(); label(jobs, "仕事と確認待ち", 22);
        if (workItems.length() == 0) label(jobs, "仕事はまだありません。", 16);
        for (int index = 0; index < workItems.length(); index++) {
            JSONObject work = workItems.optJSONObject(index);
            if (work == null) continue;
            String id = work.optString("id"), state = work.optString("state");
            label(jobs, id.substring(0, Math.min(8, id.length())) + " · " + state + (work.optBoolean("sample") ? " · サンプル" : ""), 18);
            JSONArray runs = work.optJSONArray("runs");
            if (runs != null) for (int runIndex = 0; runIndex < runs.length(); runIndex++) {
                JSONObject run = runs.optJSONObject(runIndex); if (run == null) continue;
                String error = run.isNull("error") ? "" : " / " + run.optString("error");
                label(jobs, run.optString("tool") + " : " + run.optString("state") + " / 試行 " + run.optInt("attempt") + error, 16);
            }
            if (state.equals("review") || state.equals("completed")) {
                TextView artifact = label(jobs, "", 16); artifact.setTextIsSelectable(true);
                button(jobs, "成果物を読む（長押しでコピー）", () -> worker.execute(() -> {
                    try { String output = new ShellConnection(this).result(id); runOnUiThread(() -> artifact.setText(output)); }
                    catch (Exception error) { runOnUiThread(() -> artifact.setText("成果物の整合性を確認できません。")); }
                }));
            }
            if (state.equals("review")) {
                EditText note = new EditText(this); note.setHint("本文・出典を読んで確認メモを入力"); jobs.addView(note);
                button(jobs, "本人確認して完了", () -> { String value = note.getText().toString(); perform(connection -> { connection.complete(id, value); return null; }); });
            }
            if (state.equals("active") && !work.optBoolean("sample"))
                button(jobs, "失敗した工程だけを再試行", () -> perform(connection -> { connection.retry(id); return null; }));
            if (state.equals("active") || state.equals("review"))
                button(jobs, "この仕事を中止", () -> perform(connection -> { connection.cancel(id); return null; }));
        }
    }

    @Override public void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
    private interface Action { Object run(ShellConnection connection) throws Exception; }
}
