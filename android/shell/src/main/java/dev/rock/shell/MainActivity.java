package dev.rock.shell;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
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
        ScrollView scroll = new ScrollView(this); form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        int padding = (int)(20 * getResources().getDisplayMetrics().density); form.setPadding(padding, padding, padding, padding);
        scroll.addView(form); setContentView(scroll);
        label(form, "RockstarOS · Sky → Zema", 24);
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
        label(form, "バックアップと全損復元", 22);
        label(form, "仕事・進捗・設定・非secret台帳を暗号化します。24単語はWalletのシードではなく、運営にも復号できません。", 16);
        recoveryStatus = label(form, "復元設定を確認中…", 16);
        recoveryPhraseView = label(form, "", 16); recoveryPhraseView.setTextIsSelectable(true);
        recoveryChallenge = new LinearLayout(this); recoveryChallenge.setOrientation(LinearLayout.VERTICAL);
        form.addView(recoveryChallenge);
        button(form, "復元用24単語を新しく準備", this::beginRecoverySetup);
        button(form, "指定された単語を確認して有効化", this::confirmRecoverySetup);
        button(form, "暗号化バックアップを書き出す", this::chooseBackupDestination);
        recoveryPhraseInput = field("復元時だけ24単語を入力", "", true);
        button(form, "バックアップから復元", this::chooseBackupSource);
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

    @Override public void onDestroy() {
        recoverySetupToken = null; restorePhraseForPicker = null;
        if (recoveryPhraseView != null) recoveryPhraseView.setText("");
        if (recoveryPhraseInput != null) recoveryPhraseInput.setText("");
        worker.shutdownNow(); super.onDestroy();
    }
    private interface Action { Object run(ShellConnection connection) throws Exception; }
}
