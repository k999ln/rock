package dev.rock.shell;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Unprivileged RockstarOS shell. Persistent work and execution remain in the Platform Broker. */
public final class MainActivity extends Activity {
    private static final String ARTICLE_TOOL = "article-preparation@1";
    private static final int CREATE_BACKUP_DOCUMENT = 201;
    private static final int OPEN_BACKUP_DOCUMENT = 202;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout form, jobs;
    private LinearLayout advancedPanel;
    private TextView message, skyStatus, recoveryStatus, recoveryPhraseView;
    private LinearLayout recoveryChallenge;
    private EditText zemaPrompt, markdown, summary, paid, url, cutoff, price;
    private EditText recoveryPhraseInput;
    private CheckBox zemaConsent, consent, sample;
    private final List<EditText> recoveryConfirmationInputs = new ArrayList<>();
    private volatile String skySelectionToken;
    private volatile String recoverySetupToken, restorePhraseForPicker;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(10, 15, 20));
        form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setBackgroundColor(Color.rgb(10, 15, 20));
        int padding = (int)(24 * getResources().getDisplayMetrics().density); form.setPadding(padding, padding, padding, padding);
        scroll.addView(form); setContentView(scroll);

        label(form, "avocadoOS  /  SKY", 13);
        label(form, "仕事を頼む", 30);
        label(form, "使うToolを選んで、依頼を書くだけ。\n端末内AIが安全に実行します。", 16);
        label(form, "使うTool", 13);
        skyStatus = label(form, "Skyの選択を確認中…", 16);
        button(form, "出典整理 → 無料記事 　変更", () -> perform(connection -> {
            connection.selectSkyTool(ARTICLE_TOOL); return null;
        }));
        label(form, "依頼内容", 13);
        zemaPrompt = field(form, "何をしたいですか？", "", true);
        zemaConsent = new CheckBox(this); zemaConsent.setText("この端末内で処理することを許可"); styleCheckBox(zemaConsent); form.addView(zemaConsent);
        message = label(form, "", 16);
        button(form, "このToolで実行", this::submitZema);
        button(form, "端末内AIの接続を確認", this::checkLocalAi);

        jobs = new LinearLayout(this); jobs.setOrientation(LinearLayout.VERTICAL); form.addView(jobs);

        button(form, "詳細設定（開発者向け）", () -> {
            advancedPanel.setVisibility(advancedPanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
        });
        advancedPanel = new LinearLayout(this); advancedPanel.setOrientation(LinearLayout.VERTICAL);
        advancedPanel.setVisibility(View.GONE); form.addView(advancedPanel);
        label(advancedPanel, "バックアップと復元", 22);
        label(advancedPanel, "通常は触る必要ありません。復元用の情報は端末外へ送信しません。", 16);
        recoveryStatus = label(advancedPanel, "復元設定を確認中…", 16);
        recoveryPhraseView = label(advancedPanel, "", 16); recoveryPhraseView.setTextIsSelectable(true);
        recoveryChallenge = new LinearLayout(this); recoveryChallenge.setOrientation(LinearLayout.VERTICAL);
        advancedPanel.addView(recoveryChallenge);
        button(advancedPanel, "復元用24単語を新しく準備", this::beginRecoverySetup);
        button(advancedPanel, "指定された単語を確認して有効化", this::confirmRecoverySetup);
        button(advancedPanel, "暗号化バックアップを書き出す", this::chooseBackupDestination);
        recoveryPhraseInput = field(advancedPanel, "復元時だけ24単語を入力", "", true);
        button(advancedPanel, "バックアップから復元", this::chooseBackupSource);
        label(advancedPanel, "手動入力（開発用）", 22);
        markdown = field(advancedPanel, "原稿（Markdown）", "", true);
        summary = field(advancedPanel, "まとめ（- で始まる3〜5項目）", "", true);
        cutoff = field(advancedPanel, "無料範囲の文字数", "40", false);
        price = field(advancedPanel, "完全版の表示価格（円・課金はしません）", "500", false);
        paid = field(advancedPanel, "完全版に残る内容", "", false);
        url = field(advancedPanel, "完全版の記事URL（https://note.com/.../n/...）", "", false);
        consent = new CheckBox(this); consent.setText("この原稿と成果物を端末に保存し、2工程を自動で実行することを許可する"); styleCheckBox(consent); advancedPanel.addView(consent);
        sample = new CheckBox(this); sample.setText("サンプル検証（最初の工程の結果を確認し、次へ進めない）"); styleCheckBox(sample); advancedPanel.addView(sample);
        button(advancedPanel, "仕事を保存して自動実行を予約", () -> {
            try {
                JSONObject input = new JSONObject(); input.put("markdown", markdown.getText().toString()); input.put("summary", summary.getText().toString());
                input.put("afterChars", Integer.parseInt(cutoff.getText().toString())); input.put("price", Integer.parseInt(price.getText().toString()));
                input.put("paidContents", paid.getText().toString()); input.put("noteUrl", url.getText().toString());
                String payload = input.toString(); boolean allowed = consent.isChecked(), isSample = sample.isChecked();
                perform(connection -> connection.submit(UUID.randomUUID().toString(), payload, isSample, allowed));
            } catch (Exception error) { message.setText("入力を確認してください。文字数・価格は整数、全項目の入力が必要です。"); }
        });
        button(advancedPanel, "全停止（保存した仕事は残す）", () -> perform(connection -> { connection.setPaused(true); return null; }));
        button(advancedPanel, "自動実行を再開", () -> perform(connection -> { connection.setPaused(false); return null; }));
        button(advancedPanel, "進捗を更新", () -> perform(connection -> null));
        perform(connection -> null);
    }

    private EditText field(String title, String initial, boolean multi) { return field(form, title, initial, multi); }
    private EditText field(LinearLayout container, String title, String initial, boolean multi) {
        label(container, title, 16); EditText input = new EditText(this); input.setText(initial); input.setTextSize(16);
        input.setTextColor(Color.WHITE); input.setHintTextColor(Color.rgb(146, 161, 174));
        input.setBackground(background(Color.rgb(25, 34, 43), Color.rgb(63, 80, 96), 12));
        input.setPadding(16, 14, 16, 14);
        input.setInputType(InputType.TYPE_CLASS_TEXT | (multi ? InputType.TYPE_TEXT_FLAG_MULTI_LINE : 0));
        input.setSingleLine(!multi); if (multi) input.setMinLines(3); container.addView(input); return input;
    }
    private TextView label(LinearLayout container, String text, int size) {
        TextView value = new TextView(this); value.setText(text); value.setTextSize(size);
        value.setTextColor(size >= 22 ? Color.WHITE : Color.rgb(190, 202, 214));
        value.setPadding(0, size >= 22 ? 20 : 12, 0, size >= 22 ? 10 : 8); container.addView(value); return value;
    }
    private Button button(LinearLayout container, String text, Runnable action) {
        Button value = new Button(this); value.setText(text); value.setTextColor(Color.WHITE); value.setTextSize(15);
        value.setAllCaps(false); value.setPadding(18, 12, 18, 12);
        value.setBackground(background(Color.rgb(27, 42, 54), Color.rgb(95, 151, 183), 14));
        value.setOnClickListener(view -> action.run()); container.addView(value); return value;
    }
    private void styleCheckBox(CheckBox box) { box.setTextColor(Color.rgb(205, 216, 226)); box.setPadding(0, 12, 0, 12); }
    private GradientDrawable background(int fill, int stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(fill); drawable.setCornerRadius(radius * getResources().getDisplayMetrics().density);
        drawable.setStroke((int)(1 * getResources().getDisplayMetrics().density), stroke); return drawable;
    }

    private void perform(Action action) {
        worker.execute(() -> {
            try {
                ShellConnection connection = new ShellConnection(this);
                action.run(connection);
                JSONObject snapshot = new JSONObject(connection.snapshot());
                JSONObject selection = new JSONObject(connection.skySelection());
                JSONObject recovery = new JSONObject(connection.recoveryStatus());
                boolean paused = snapshot.getBoolean("paused");
                JSONArray workItems = snapshot.getJSONArray("works");
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        applySkySelection(selection);
                        applyRecoveryStatus(recovery);
                        message.setText(paused ? "全停止中" : "予約済みの仕事は充電中に実行します。原稿・成果物はBroker側だけに保存します。");
                        render(workItems);
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> { if (!isDestroyed()) message.setText("処理できませんでした。Broker、署名、保存同意、入力内容、工程状態を確認してください。"); });
            }
        });
    }

    private void beginRecoverySetup() {
        message.setText("端末内で復元用24単語を生成しています…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this).beginRecoverySetup());
                if (!"confirmation_required".equals(response.optString("status"))) {
                    throw new IllegalStateException(response.optString("code"));
                }
                String token = response.getString("setupToken");
                String phrase = response.getString("phrase");
                JSONArray numbers = response.getJSONArray("confirmWordNumbers");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    recoverySetupToken = token;
                    recoveryPhraseView.setText("この24単語を紙など別々の2か所へ保存してください。Walletには入力しないでください。\n\n" + phrase);
                    recoveryChallenge.removeAllViews(); recoveryConfirmationInputs.clear();
                    for (int index = 0; index < numbers.length(); index++) {
                        int number = numbers.optInt(index);
                        EditText input = new EditText(this);
                        input.setHint(number + "番目の単語"); input.setSingleLine(true);
                        recoveryChallenge.addView(input); recoveryConfirmationInputs.add(input);
                    }
                    message.setText("保存後、指定された4単語を入力して有効化してください。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> message.setText("復元用24単語を準備できませんでした。端末ロックとBrokerを確認してください。"));
            }
        });
    }

    private void confirmRecoverySetup() {
        String token = recoverySetupToken;
        JSONArray words = new JSONArray();
        for (EditText input : recoveryConfirmationInputs) words.put(input.getText().toString());
        if (token == null || words.length() != 4) {
            message.setText("先に24単語を準備してください。"); return;
        }
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .confirmRecoverySetup(token, words.toString()));
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    if ("configured".equals(response.optString("status"))) {
                        recoverySetupToken = null; recoveryPhraseView.setText("");
                        recoveryChallenge.removeAllViews(); recoveryConfirmationInputs.clear();
                        recoveryStatus.setText("復元用24単語: 設定済み");
                        message.setText("復元設定を有効化しました。次に暗号化バックアップを書き出してください。");
                    } else message.setText("指定された単語が一致しません。表示された番号を確認してください。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> message.setText("復元設定を有効化できませんでした。"));
            }
        });
    }

    private void chooseBackupDestination() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/octet-stream")
            .putExtra(Intent.EXTRA_TITLE, "rockstaros-backup-" + System.currentTimeMillis() + ".arb");
        startActivityForResult(intent, CREATE_BACKUP_DOCUMENT);
    }

    private void chooseBackupSource() {
        String phrase = recoveryPhraseInput.getText().toString().trim();
        if (phrase.split("\\s+").length != 24) {
            message.setText("復元用24単語をすべて入力してください。"); return;
        }
        restorePhraseForPicker = phrase;
        recoveryPhraseInput.setText("");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream");
        startActivityForResult(intent, OPEN_BACKUP_DOCUMENT);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == OPEN_BACKUP_DOCUMENT) restorePhraseForPicker = null;
            return;
        }
        Uri uri = data.getData();
        if (requestCode == CREATE_BACKUP_DOCUMENT) {
            worker.execute(() -> {
                try (ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "w")) {
                    JSONObject response = new JSONObject(new ShellConnection(this).createRecoverableBackup(
                        UUID.randomUUID().toString(), descriptor));
                    String text = "exported".equals(response.optString("status"))
                        ? "バックアップを書き出しました。SHA-256: " + response.optString("sha256")
                        : "バックアップを書き出せませんでした。復元設定を先に完了してください。";
                    runOnUiThread(() -> message.setText(text));
                } catch (Exception failure) {
                    runOnUiThread(() -> message.setText("バックアップを書き出せませんでした。"));
                }
            });
        } else if (requestCode == OPEN_BACKUP_DOCUMENT) {
            String phrase = restorePhraseForPicker; restorePhraseForPicker = null;
            worker.execute(() -> {
                try (ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "r")) {
                    JSONObject response = new JSONObject(new ShellConnection(this)
                        .restoreRecoverableBackup(descriptor, phrase));
                    runOnUiThread(() -> {
                        recoveryPhraseInput.setText("");
                        message.setText("restored".equals(response.optString("status"))
                            ? "復元しました。安全のため自動実行は停止中です。内容を確認してから再開してください。"
                            : "復元できませんでした。24単語、所有者、ファイル、空の復元先を確認してください。");
                    });
                } catch (Exception failure) {
                    runOnUiThread(() -> message.setText("復元できませんでした。"));
                }
            });
        }
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

    private void applyRecoveryStatus(JSONObject status) {
        if (status.optBoolean("configured")) {
            recoveryStatus.setText("復元用24単語: 設定済み · 形式 " + status.optString("format")
                + (status.optBoolean("recoverySecretHardwareBacked") ? " · hardware-backed" : " · hardware確認待ち"));
        } else recoveryStatus.setText("復元用24単語: 未設定");
    }

    private void render(JSONArray workItems) {
        jobs.removeAllViews(); label(jobs, "最近の仕事", 22);
        int visibleJobs = 0;
        for (int index = 0; index < workItems.length(); index++) {
            JSONObject work = workItems.optJSONObject(index);
            if (work == null) continue;
            String id = work.optString("id"), state = work.optString("state");
            // Old cancelled test runs are developer history, not user work.
            if ("cancelled".equals(state)) continue;
            visibleJobs++;
            LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(16, 14, 16, 14); card.setBackground(background(Color.rgb(19, 28, 36), Color.rgb(48, 66, 80), 14)); jobs.addView(card);
            label(card, friendlyState(state), 18);
            JSONArray runs = work.optJSONArray("runs");
            int succeeded = 0, total = runs == null ? 0 : runs.length();
            if (runs != null) for (int runIndex = 0; runIndex < runs.length(); runIndex++) {
                JSONObject run = runs.optJSONObject(runIndex); if (run != null && "succeeded".equals(run.optString("state"))) succeeded++;
            }
            if (total > 0) label(card, succeeded + " / " + total + " 工程が完了", 16);
            if (state.equals("review") || state.equals("completed")) {
                TextView artifact = label(card, "", 16); artifact.setTextIsSelectable(true);
                button(card, "成果物を表示", () -> worker.execute(() -> {
                    try { String output = new ShellConnection(this).result(id); runOnUiThread(() -> artifact.setText(output)); }
                    catch (Exception error) { runOnUiThread(() -> artifact.setText("成果物の整合性を確認できません。")); }
                }));
            }
            if (state.equals("review")) {
                EditText note = new EditText(this); note.setHint("確認メモ（任意）"); note.setTextColor(Color.WHITE); note.setHintTextColor(Color.rgb(146, 161, 174));
                note.setBackground(background(Color.rgb(25, 34, 43), Color.rgb(63, 80, 96), 12)); note.setPadding(16, 14, 16, 14); card.addView(note);
                button(card, "確認して完了", () -> { String value = note.getText().toString(); perform(connection -> { connection.complete(id, value); return null; }); });
            }
            if (state.equals("active") && !work.optBoolean("sample"))
                button(card, "失敗した工程だけを再試行", () -> perform(connection -> { connection.retry(id); return null; }));
        }
        if (visibleJobs == 0) label(jobs, "まだ仕事はありません。ここから実行できます。", 16);
    }

    private static String friendlyState(String state) {
        if ("review".equals(state)) return "確認待ち";
        if ("completed".equals(state)) return "完了";
        if ("active".equals(state)) return "実行中";
        if ("queued".equals(state)) return "待機中";
        if ("cancelled".equals(state)) return "中止";
        if ("failed".equals(state)) return "失敗";
        return "処理中";
    }

    @Override public void onDestroy() {
        recoverySetupToken = null; restorePhraseForPicker = null;
        if (recoveryPhraseView != null) recoveryPhraseView.setText("");
        if (recoveryPhraseInput != null) recoveryPhraseInput.setText("");
        worker.shutdownNow(); super.onDestroy();
    }
    private interface Action { Object run(ShellConnection connection) throws Exception; }
}
