package dev.rock.shell;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
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
import java.util.Locale;
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
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Handler deviceLinkHandler = new Handler(Looper.getMainLooper());
    private final Handler cloudTaskHandler = new Handler(Looper.getMainLooper());
    private ConnectivityManager cloudConnectivityManager;
    private ConnectivityManager.NetworkCallback cloudConnectivityCallback;
    private boolean cloudNetworkValidated;
    private LinearLayout form, jobs;
    private LinearLayout advancedPanel;
    private TextView message, skyStatus, recoveryStatus, recoveryPhraseView, deviceCapabilityStatus;
    private TextView accountLinkStatus, accountLinkCode;
    private TextView cloudServiceHomeStatus;
    private LinearLayout entitlementClaimPanel;
    private EditText entitlementClaimPackageInput;
    private TextView entitlementClaimStatus;
    private LinearLayout cloudTaskActions;
    private TextView cloudTaskDetailStatus;
    private LinearLayout cloudTaskDetailActions;
    private EditText cloudLlmPrompt, cloudLlmBudget, cloudLlmCurrency;
    private CheckBox cloudLlmSaveResult, cloudLlmExecutionConsent;
    private TextView cloudLlmQuoteSummary;
    private Button cloudLlmExecuteButton;
    private String cloudLlmQuotedPrompt, cloudLlmQuoteId, cloudLlmApprovalDigest, cloudLlmQuotedModel, cloudLlmQuotedCurrency;
    private long cloudLlmQuotedCapMinor;
    private int cloudLlmQuotedOutputLimit;
    private boolean cloudLlmQuotedSaveResult;
    private EditText cloudA2aPrompt, cloudA2aBudget, cloudA2aCurrency;
    private CheckBox cloudA2aQuoteDisclosureConsent;
    private TextView cloudA2aQuoteStatus;
    private LinearLayout cloudA2aAgentList;
    private LinearLayout cloudA2aParentList;
    private EditText cloudA2aParentBudget;
    private TextView cloudA2aParentSelection;
    private Button cloudA2aPrepareDraftButton, cloudA2aRecoverDraftButton;
    private Button cloudA2aWalletApprovalButton, cloudA2aWalletReserveButton, cloudA2aWalletReleaseButton;
    private Button cloudA2aBrokerProofButton;
    private Button cloudA2aFinalApprovalButton, cloudA2aExecutionRecoveryButton;
    private CheckBox cloudA2aPaidExecutionConsent, cloudA2aExecutionConsent;
    private JSONObject cloudA2aVerifiedQuote;
    private JSONObject cloudA2aCurrentDraft;
    private String cloudA2aQuotedPrompt, cloudA2aQuotedCurrency, cloudA2aQuotedAgentId;
    private long cloudA2aQuotedBudgetMinor;
    private String cloudA2aSelectedParentId, cloudA2aSelectedParentTitle;
    private String cloudA2aRecoveryParentId, cloudA2aRecoveryIdempotencyKey, cloudA2aRecoveryInputSha256;
    private String cloudA2aWalletApprovalId, cloudA2aHeldDelegationId;
    private Button accountLinkApprovalButton, accountLinkCheckButton;
    private LinearLayout recoveryChallenge;
    private EditText zemaPrompt, markdown, summary, paid, url, cutoff, price;
    private EditText recoveryPhraseInput;
    private EditText esimChallengeInput;
    private TextView esimGatewayResult;
    private EditText a2aBrokerKeyIdInput, a2aSettlementDelegationIdInput;
    private TextView a2aBrokerStatus;
    private CheckBox zemaConsent, consent, sample;
    private final List<EditText> recoveryConfirmationInputs = new ArrayList<>();
    private volatile String skySelectionToken;
    private volatile String deviceLinkFlowId, deviceLinkApprovalUri;
    private volatile long deviceLinkNextPollAt;
    private boolean activityResumed;
    private boolean cloudServiceHomeRequestInFlight;
    private final Runnable cloudTaskRefresh = () -> {
        if (activityResumed && !isDestroyed()) refreshCloudServiceHome();
    };
    private final Runnable deviceLinkPoll = this::pollDeviceLink;
    private volatile String recoverySetupToken, restorePhraseForPicker;
    private volatile long deviceCapabilityExpiresAt = -1;
    private Runnable deviceCapabilityExpiry;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(10, 15, 20));
        form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setBackgroundColor(Color.rgb(10, 15, 20));
        int padding = (int)(24 * getResources().getDisplayMetrics().density); form.setPadding(padding, padding, padding, padding);
        scroll.addView(form); setContentView(scroll);

        label(form, "RockstarOS  /  Sky  /  Zema", 13);
        label(form, "AIサービスを使う", 30);
        label(form, "Rockstarアカウントを一度連携します。サービスごとの利用権・接続状態は個別に確認します。", 16);
        accountLinkStatus = label(form, "アカウント状態を確認中…", 15);
        accountLinkCode = label(form, "", 26); accountLinkCode.setTextIsSelectable(true);
        button(form, "Rockstarアカウントを連携", this::beginDeviceLink);
        accountLinkApprovalButton = button(form, "ブラウザーで承認ページを開く", this::openDeviceLinkApproval);
        accountLinkApprovalButton.setVisibility(View.GONE);
        accountLinkCheckButton = button(form, "承認状態を確認", this::pollDeviceLink);
        accountLinkCheckButton.setVisibility(View.GONE);
        label(form, "Sky・Zema・クラウドエージェント", 20);
        cloudServiceHomeStatus = label(form, "アカウント連携後に、利用権とクラウド作業をここで確認できます。", 14);
        button(form, "クラウドの状態・作業結果を更新", this::refreshCloudServiceHome);
        entitlementClaimPanel = new LinearLayout(this); entitlementClaimPanel.setOrientation(LinearLayout.VERTICAL);
        entitlementClaimPanel.setVisibility(View.GONE); form.addView(entitlementClaimPanel);
        label(entitlementClaimPanel, "購入済みSIM/eSIMのRockstarOS利用権を登録", 18);
        label(entitlementClaimPanel, "販売元から届いた購入claim JSONを貼り付けます。登録先はこのRockstar IDです。回線開通とは別です。", 13);
        entitlementClaimPackageInput = new EditText(this);
        entitlementClaimPackageInput.setHint("{\"claim\":{...},\"claimCode\":\"rsk_…\"}");
        entitlementClaimPackageInput.setMinLines(3);
        entitlementClaimPackageInput.setMaxLines(8);
        entitlementClaimPackageInput.setGravity(android.view.Gravity.TOP | android.view.Gravity.START);
        entitlementClaimPackageInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE |
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        entitlementClaimPackageInput.setSaveEnabled(false);
        entitlementClaimPackageInput.setAutofillHints((String[]) null);
        entitlementClaimPackageInput.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        entitlementClaimPackageInput.setTextColor(Color.WHITE);
        entitlementClaimPackageInput.setHintTextColor(Color.LTGRAY);
        entitlementClaimPanel.addView(entitlementClaimPackageInput, new LinearLayout.LayoutParams(-1, -2));
        button(entitlementClaimPanel, "このRockstar IDへ利用権を登録", this::confirmEntitlementClaim);
        entitlementClaimStatus = label(entitlementClaimPanel, "claimは端末に保存せず、登録後に入力欄から消去します。", 13);
        cloudTaskActions = new LinearLayout(this); cloudTaskActions.setOrientation(LinearLayout.VERTICAL);
        form.addView(cloudTaskActions);
        cloudTaskDetailStatus = label(form, "詳細を開くと、選択した仕事の状態または成果を取得します。", 13);
        cloudTaskDetailStatus.setTextIsSelectable(true);
        cloudTaskDetailActions = new LinearLayout(this); cloudTaskDetailActions.setOrientation(LinearLayout.VERTICAL);
        form.addView(cloudTaskDetailActions);
        label(form, "Sky Agentを探して見積を確認", 20);
        label(form, "接続済みAgentの自己申告情報を確認し、依頼文を見積のためProviderへ送る場合は明示同意します。ここでは見積だけを取得し、有料実行は開始しません。", 14);
        cloudA2aPrompt = field(form, "Agentへ依頼する内容", "", true);
        cloudA2aCurrency = field(form, "見積通貨（ISO 4217）", "USD", false);
        cloudA2aBudget = field(form, "この依頼の最大額（通貨単位）", "1.00", false);
        cloudA2aQuoteDisclosureConsent = new CheckBox(this);
        cloudA2aQuoteDisclosureConsent.setText("依頼文をRockstarOSの見積サービス経由で選択したAgentへ送信することに同意する");
        styleCheckBox(cloudA2aQuoteDisclosureConsent); form.addView(cloudA2aQuoteDisclosureConsent);
        button(form, "接続済みAgentを表示", this::refreshCloudA2AAgents);
        cloudA2aAgentList = new LinearLayout(this); cloudA2aAgentList.setOrientation(LinearLayout.VERTICAL);
        form.addView(cloudA2aAgentList);
        cloudA2aQuoteStatus = label(form, "Agentを選ぶとProvider署名済み見積を確認します。見積は有料実行の承認ではありません。", 14);
        cloudA2aQuoteStatus.setTextIsSelectable(true);
        label(form, "委任先の親job", 16);
        label(form, "実行中またはレビュー中のZema jobだけを選べます。委任案を保存してもAgentへは送信されません。", 13);
        cloudA2aParentSelection = label(form, "親job未選択", 14);
        cloudA2aParentList = new LinearLayout(this); cloudA2aParentList.setOrientation(LinearLayout.VERTICAL);
        form.addView(cloudA2aParentList);
        cloudA2aParentBudget = field(form, "親job全体で許可する最大額（見積通貨）", "2.00", false);
        cloudA2aPrepareDraftButton = button(form, "見積条件で委任案を保存", this::prepareCloudA2ADelegation);
        cloudA2aPrepareDraftButton.setVisibility(View.GONE);
        cloudA2aRecoverDraftButton = button(form, "前回の委任案をIDで照合", this::recoverCloudA2ADelegation);
        cloudA2aRecoverDraftButton.setVisibility(View.GONE);
        cloudA2aPaidExecutionConsent = new CheckBox(this);
        cloudA2aPaidExecutionConsent.setText("この委任案の見積上限を端末内Walletに予約する（Cloud実行の承認とは別です）");
        styleCheckBox(cloudA2aPaidExecutionConsent); cloudA2aPaidExecutionConsent.setVisibility(View.GONE); form.addView(cloudA2aPaidExecutionConsent);
        cloudA2aWalletApprovalButton = button(form, "Wallet予約の内容を確認して本人承認へ", this::requestCloudA2AWalletApproval);
        cloudA2aWalletApprovalButton.setVisibility(View.GONE);
        cloudA2aWalletReserveButton = button(form, "本人確認後にWallet上限を予約", this::confirmCloudA2AWalletReservation);
        cloudA2aWalletReserveButton.setVisibility(View.GONE);
        cloudA2aWalletReleaseButton = button(form, "Cloud実行前のWallet予約を解除", this::releaseCloudA2AWalletReservation);
        cloudA2aWalletReleaseButton.setVisibility(View.GONE);
        cloudA2aExecutionConsent = new CheckBox(this);
        cloudA2aExecutionConsent.setText("この依頼をCloud Agentへ渡し、端末が圏外でも継続することに同意する（予約上限を超える追加実行は許可しない）");
        styleCheckBox(cloudA2aExecutionConsent); cloudA2aExecutionConsent.setVisibility(View.GONE); form.addView(cloudA2aExecutionConsent);
        cloudA2aBrokerProofButton = button(form, "同意した内容をBroker証明として登録", this::registerCloudA2ABrokerAuthorization);
        cloudA2aBrokerProofButton.setVisibility(View.GONE);
        cloudA2aFinalApprovalButton = button(form, "Cloud作業を最終承認", this::confirmCloudA2AExecution);
        cloudA2aFinalApprovalButton.setVisibility(View.GONE);
        cloudA2aExecutionRecoveryButton = button(form, "同じCloud委任IDの状態を再確認", this::recoverCloudA2AExecution);
        cloudA2aExecutionRecoveryButton.setVisibility(View.GONE);
        label(form, "クラウドLLMへの依頼", 20);
        label(form, "見積依頼では入力をRockstarOSのサービスへ送ります。LLM Providerへの実行送信は行いません。上限は表示通貨の金額で入力してください。", 14);
        cloudLlmPrompt = field(form, "クラウドLLMに依頼する内容", "", true);
        cloudLlmCurrency = field(form, "見積通貨（ISO 4217）", "USD", false);
        cloudLlmBudget = field(form, "この依頼で許可する最大額（通貨単位）", "1.00", false);
        cloudLlmSaveResult = new CheckBox(this);
        cloudLlmSaveResult.setText("完了後に成果をクラウドへ保存し、端末から再取得できるようにする");
        styleCheckBox(cloudLlmSaveResult); form.addView(cloudLlmSaveResult);
        cloudLlmQuoteSummary = label(form, "未見積。実行前にこの依頼の上限額を確認します。", 14);
        button(form, "料金を見積もって依頼を準備", this::prepareCloudLlmQuote);
        cloudLlmExecutionConsent = new CheckBox(this);
        cloudLlmExecutionConsent.setText("表示された上限額を承認し、この依頼をクラウドへ送信する");
        styleCheckBox(cloudLlmExecutionConsent); cloudLlmExecutionConsent.setVisibility(View.GONE); form.addView(cloudLlmExecutionConsent);
        cloudLlmExecuteButton = button(form, "上限を承認してクラウド実行", this::executeCloudLlmQuote);
        cloudLlmExecuteButton.setVisibility(View.GONE);
        label(form, "このShellのToolは端末内で動作します。有料クラウド作業は見積・上限承認・利用明細の経路が接続するまで開始しません。", 15);
        label(form, "この端末の対応状況", 18);
        deviceCapabilityStatus = label(form, "端末機能を確認中…", 14);
        button(form, "端末対応を再確認", () -> perform(connection -> null));
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
        label(advancedPanel, "Sky Agent連携とWallet受取", 22);
        label(advancedPanel, "端末鍵登録は認証済みRockstarアカウントとhardware-backed Keystoreを使います。強い保護が利用できない端末は登録できません。Cloud成果のWallet反映は、同じAgent依頼の端末内承認・予約が存在する場合だけ行い、未承認の依頼を実行しません。", 15);
        a2aBrokerStatus = label(advancedPanel, "Agent用端末鍵は未確認です。", 14);
        button(advancedPanel, "このBroker端末をattestation登録", this::enrollA2ABrokerDevice);
        a2aBrokerKeyIdInput = field(advancedPanel, "失効する登録鍵のkey ID", "", false);
        button(advancedPanel, "サーバーで鍵を失効し、この端末鍵を削除", this::confirmRevokeA2ABrokerDevice);
        a2aSettlementDelegationIdInput = field(advancedPanel, "承認済みAgent依頼のdelegation ID", "", false);
        button(advancedPanel, "既存のWallet受取を同期", this::syncA2AWalletSettlement);
        label(advancedPanel, "eSIM端末認証（開発用）", 22);
        label(advancedPanel, "サインイン済みの注文画面で発行したchallenge JSONを貼り付けると、Brokerがchallenge nonceに結び付いたAndroid Keystore鍵を準備します。証明書チェーンはサーバーへ戻すための公開情報です。これはeSIMの導入・利用権を確認せず、回線を有効化しません。", 15);
        esimChallengeInput = field(advancedPanel, "challenge JSON", "", true);
        esimGatewayResult = label(advancedPanel, "", 13); esimGatewayResult.setTextIsSelectable(true);
        button(advancedPanel, "端末認証鍵を準備", this::provisionEsimGatewayKey);
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
    }

    private void provisionEsimGatewayKey() {
        String challenge = esimChallengeInput.getText().toString();
        if (challenge.isEmpty() || challenge.length() > 20_000) {
            esimGatewayResult.setText("challenge JSONを確認してください。");
            return;
        }
        esimGatewayResult.setText("Android Keystoreの端末鍵を確認中…");
        worker.execute(() -> {
            String response;
            try { response = new ShellConnection(this).provisionEsimGatewayKey(challenge, false); }
            catch (Exception unavailable) { response = "{\"state\":\"blocked\",\"error\":\"BROKER_OR_KEYSTORE_UNAVAILABLE\"}"; }
            final String result = response;
            runOnUiThread(() -> { if (!isDestroyed()) esimGatewayResult.setText(result); });
        });
    }

    private void enrollA2ABrokerDevice() {
        a2aBrokerStatus.setText("RockstarアカウントとAndroid Keystoreのattestationを確認中…");
        worker.execute(() -> {
            try {
                JSONObject result = new JSONObject(new ShellConnection(this).enrollA2ABrokerDevice(false));
                String state = result.optString("state");
                if (!"registered".equals(state) && !"already_registered".equals(state))
                    throw new IllegalStateException(result.optString("error", "BROKER_ENROLLMENT_FAILED"));
                String keyId = result.optString("keyId");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    a2aBrokerKeyIdInput.setText(keyId);
                    a2aBrokerStatus.setText("サーバー登録済み — " + result.optString("algorithm") +
                        " / hardware-backed: " + result.optBoolean("hardwareBacked") +
                        " / StrongBox: " + result.optBoolean("strongBoxBacked") +
                        "。端末の紛失・交換時は鍵を失効してください。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) a2aBrokerStatus.setText(
                    "登録できません。サインイン、端末のロック状態、ネットワーク、対応Keystoreを確認してください。既存鍵やCloud作業は変更していません。"); });
            }
        });
    }

    private void confirmRevokeA2ABrokerDevice() {
        String keyId = a2aBrokerKeyIdInput.getText().toString().trim();
        if (!keyId.matches("[a-f0-9]{64}")) {
            a2aBrokerStatus.setText("登録時に表示された64桁のkey IDを確認してください。"); return;
        }
        new android.app.AlertDialog.Builder(this)
            .setTitle("Broker端末鍵を失効しますか？")
            .setMessage("サーバー側で鍵を失効した後、この端末の対応する署名鍵を削除します。Cloud作業や回線は停止しません。")
            .setNegativeButton("戻る", null)
            .setPositiveButton("失効する", (dialog, which) -> revokeA2ABrokerDevice(keyId))
            .show();
    }

    private void revokeA2ABrokerDevice(String keyId) {
        a2aBrokerStatus.setText("サーバーの鍵を失効中…");
        worker.execute(() -> {
            try {
                JSONObject result = new JSONObject(new ShellConnection(this).revokeA2ABrokerDevice(keyId));
                if ("server_revoked_local_cleanup_pending".equals(result.optString("state"))) {
                    runOnUiThread(() -> { if (!isDestroyed()) a2aBrokerStatus.setText(
                        "サーバーでは失効済みですが、端末の鍵削除を確認できませんでした。key IDを残しています。再試行するか端末管理者に確認してください。"); });
                    return;
                }
                if (!"revoked".equals(result.optString("state")))
                    throw new IllegalStateException(result.optString("error", "BROKER_REVOCATION_FAILED"));
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    a2aBrokerKeyIdInput.setText("");
                    a2aBrokerStatus.setText("サーバーで失効を確認し、端末鍵を削除しました。新しい連携には再登録が必要です。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) a2aBrokerStatus.setText(
                    "失効を確認できません。サーバー応答を照合できるまで、端末鍵は削除していません。"); });
            }
        });
    }

    private void syncA2AWalletSettlement() {
        String delegationId = a2aSettlementDelegationIdInput.getText().toString().trim();
        if (!delegationId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) {
            a2aBrokerStatus.setText("正しいdelegation IDを入力してください。新しい仕事の実行は始まりません。"); return;
        }
        a2aBrokerStatus.setText("既存の端末内予算予約とCloud署名receiptを照合中…");
        worker.execute(() -> {
            try {
                JSONObject result = new JSONObject(new ShellConnection(this)
                    .syncA2AWalletSettlement(delegationId));
                if (!"settled".equals(result.optString("state")))
                    throw new IllegalStateException(result.optString("error", "WALLET_HANDOFF_FAILED"));
                runOnUiThread(() -> { if (!isDestroyed()) a2aBrokerStatus.setText(
                    "端末内Walletへ照合済みの受取を反映しました。receipt ID: " + result.optString("receiptId")); });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) a2aBrokerStatus.setText(
                    "受取を反映できません。本人・端末鍵・既存の有効な端末内予約とCloud receiptを確認してください。重複実行はせず、元の仕事は維持しています。"); });
            }
        });
    }

    @Override protected void onResume() {
        super.onResume();
        activityResumed = true;
        restoreA2ARecovery();
        observeCloudReconnect();
        perform(connection -> null);
    }

    @Override protected void onPause() {
        activityResumed = false;
        stopObservingCloudReconnect();
        deviceLinkHandler.removeCallbacks(deviceLinkPoll);
        cloudTaskHandler.removeCallbacks(cloudTaskRefresh);
        super.onPause();
    }

    /** Refresh owner-scoped job state once after an offline-to-validated-network transition. */
    private void observeCloudReconnect() {
        if (cloudConnectivityCallback != null) return;
        cloudConnectivityManager = getSystemService(ConnectivityManager.class);
        if (cloudConnectivityManager == null) return;
        cloudNetworkValidated = false;
        cloudConnectivityCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                boolean validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                if (!validated || cloudNetworkValidated) return;
                cloudNetworkValidated = true;
                mainHandler.post(() -> {
                    if (activityResumed && !isDestroyed()) refreshCloudServiceHome();
                });
            }

            @Override public void onLost(Network network) {
                cloudNetworkValidated = false;
            }
        };
        try {
            cloudConnectivityManager.registerDefaultNetworkCallback(cloudConnectivityCallback);
        } catch (RuntimeException unavailable) {
            cloudConnectivityCallback = null;
            cloudConnectivityManager = null;
        }
    }

    private void stopObservingCloudReconnect() {
        if (cloudConnectivityManager != null && cloudConnectivityCallback != null) {
            try { cloudConnectivityManager.unregisterNetworkCallback(cloudConnectivityCallback); }
            catch (RuntimeException alreadyUnregistered) { /* lifecycle cleanup is best effort */ }
        }
        cloudConnectivityCallback = null;
        cloudConnectivityManager = null;
        cloudNetworkValidated = false;
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
                JSONObject deviceCapabilities = snapshot.optJSONObject("deviceCapabilities");
                JSONObject selection = new JSONObject(connection.skySelection());
                JSONObject recovery = new JSONObject(connection.recoveryStatus());
                JSONObject account = new JSONObject(connection.rockstarDeviceLinkStatus());
                JSONObject cloudHome = "linked".equals(account.optString("state"))
                    ? new JSONObject(connection.cloudServiceHome()) : new JSONObject("{\"state\":\"not_linked\"}");
                boolean paused = snapshot.getBoolean("paused");
                JSONArray workItems = snapshot.getJSONArray("works");
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        applyDeviceCapabilities(deviceCapabilities);
                        applySkySelection(selection);
                        applyRecoveryStatus(recovery);
                        applyDeviceLinkStatus(account);
                        applyCloudServiceHome(cloudHome);
                        message.setText(paused ? "全停止中" : "予約済みの仕事は充電中に実行します。原稿・成果物はBroker側だけに保存します。");
                        render(workItems);
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> { if (!isDestroyed()) message.setText("処理できませんでした。Broker、署名、保存同意、入力内容、工程状態を確認してください。"); });
            }
        });
    }

    private void refreshCloudServiceHome() {
        if (cloudServiceHomeRequestInFlight) return;
        cloudServiceHomeRequestInFlight = true;
        cloudServiceHomeStatus.setText("クラウドの状態を取得中…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this).cloudServiceHome());
                runOnUiThread(() -> {
                    cloudServiceHomeRequestInFlight = false;
                    if (!isDestroyed()) applyCloudServiceHome(response);
                });
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    cloudServiceHomeRequestInFlight = false;
                    if (!isDestroyed()) {
                        cloudTaskHandler.removeCallbacks(cloudTaskRefresh);
                        cloudServiceHomeStatus.setText("取得できません。通信状態とRockstarアカウント連携を確認してください。");
                    }
                });
            }
        });
    }

    private void refreshCloudA2AAgents() {
        cloudA2aAgentList.removeAllViews();
        cloudA2aQuoteStatus.setText("所有者の接続済みAgent一覧を取得中…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this).cloudA2AAgents());
                JSONArray agents = response.optJSONArray("agents");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aAgentList.removeAllViews();
                    if (agents == null) {
                        cloudA2aQuoteStatus.setText("Agent一覧を確認できません。アカウント連携、Sky利用権、通信状態を確認してください。");
                        return;
                    }
                    if (agents.length() == 0) {
                        cloudA2aQuoteStatus.setText("接続済みAgentはありません。SkyでAgentを接続するとここに表示されます。");
                        return;
                    }
                    for (int i = 0; i < agents.length() && i < 30; i++) {
                        JSONObject agent = agents.optJSONObject(i);
                        if (agent == null) continue;
                        String id = agent.optString("id", "");
                        String name = agent.optString("agentName", "未確認Agent");
                        String origin = agent.optString("origin", "");
                        String version = agent.optString("agentVersion", "");
                        if (id.isEmpty() || origin.isEmpty() || version.isEmpty()) continue;
                        button(cloudA2aAgentList, name + "  /  " + origin + "  /  v" + version + "  /  見積を確認",
                            () -> requestCloudA2APriceQuote(id));
                        label(cloudA2aAgentList, "Agent Cardの機能・安全性は自己申告です。Provider署名済み見積を別途確認します。", 12);
                    }
                    cloudA2aQuoteStatus.setText("Agentを選択してください。見積取得は依頼文をProviderへ共有しますが、有料実行は行いません。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    if (!isDestroyed()) cloudA2aQuoteStatus.setText(
                        "Agent一覧を取得できません。オンライン状態、アカウント連携、Sky利用権を確認してください。");
                });
            }
        });
    }

    private void requestCloudA2APriceQuote(String agentId) {
        final String prompt = cloudA2aPrompt.getText().toString();
        final String currency = cloudA2aCurrency.getText().toString().trim().toUpperCase(java.util.Locale.ROOT);
        final Long capMinor = UsageCurrencyFormatter.parseMajorToMinor(cloudA2aBudget.getText().toString(), currency);
        if (prompt.trim().isEmpty() || prompt.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8_000 ||
                capMinor == null || capMinor < 1 || capMinor > 100_000_000L || !currency.matches("[A-Z]{3}")) {
            cloudA2aQuoteStatus.setText("依頼文、ISO通貨コード、最大額を確認してください。");
            return;
        }
        if (!cloudA2aQuoteDisclosureConsent.isChecked()) {
            cloudA2aQuoteStatus.setText("見積取得では依頼文をProviderへ送ります。共有への同意を確認してから再度選んでください。");
            return;
        }
        final String quoteRequestId = UUID.randomUUID().toString();
        final long expiresAt = System.currentTimeMillis() + 5L * 60 * 1000;
        final boolean consentToSharePrompt = cloudA2aQuoteDisclosureConsent.isChecked();
        cloudA2aVerifiedQuote = null;
        cloudA2aQuotedPrompt = null;
        cloudA2aPrepareDraftButton.setVisibility(View.GONE);
        cloudA2aQuoteStatus.setText("同意を記録して見積を取得し、Provider署名と依頼条件を端末内で検証しています…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this).requestCloudA2APriceQuote(
                    agentId, quoteRequestId, prompt, currency, capMinor, expiresAt,
                    consentToSharePrompt));
                if (!response.optBoolean("verified") || !response.optBoolean("quoteOnly") ||
                        response.optBoolean("executionAuthorized"))
                    throw new IllegalStateException("PRICE_QUOTE_NOT_VERIFIED");
                StringBuilder display = new StringBuilder();
                display.append("署名済み見積（端末内で署名・条件を検証済み）")
                    .append("\nProvider: ").append(response.optString("providerId"))
                    .append(" / Agent: ").append(response.optString("agentName"))
                    .append(" v").append(response.optString("agentVersion"))
                    .append("\n見積額: ").append(UsageCurrencyFormatter.formatMinor(
                        response.optLong("estimateMinor", -1), currency, java.util.Locale.getDefault()))
                    .append(" / 最大額: ").append(UsageCurrencyFormatter.formatMinor(
                        response.optLong("maxAmountMinor", -1), currency, java.util.Locale.getDefault()))
                    .append("\n価格版: ").append(response.optString("pricingVersion"))
                    .append(" / 有効期限: ").append(android.text.format.DateFormat.format(
                        "yyyy-MM-dd HH:mm", response.optLong("expiresAt", 0)))
                    .append("\n内訳:");
                JSONArray usage = response.optJSONArray("usage");
                if (usage != null) for (int i = 0; i < usage.length() && i < 20; i++) {
                    JSONObject line = usage.optJSONObject(i);
                    if (line == null) continue;
                    display.append("\n・").append(line.optString("meter"))
                        .append(": ").append(line.optLong("quantity")).append(' ')
                        .append(line.optString("unit")).append(" × ")
                        .append(UsageCurrencyFormatter.formatMinor(line.optLong("unitPriceMinor", -1),
                            currency, java.util.Locale.getDefault()))
                        .append(" = ").append(UsageCurrencyFormatter.formatMinor(line.optLong("amountMinor", -1),
                            currency, java.util.Locale.getDefault()));
                }
                display.append("\n\nこの操作は見積のみです。Agent実行、Wallet予約、請求は行っていません。");
                final String result = display.toString();
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aVerifiedQuote = response;
                    cloudA2aQuotedPrompt = prompt;
                    cloudA2aQuotedCurrency = currency;
                    cloudA2aQuotedBudgetMinor = response.optLong("maxAmountMinor", capMinor);
                    cloudA2aQuotedAgentId = agentId;
                    cloudA2aQuoteStatus.setText(result);
                    updateA2APrepareButton();
                    refreshCloudServiceHome();
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) cloudA2aQuoteStatus.setText(
                    "見積を確認できません。署名鍵、Agentの状態、通信を確認してください。依頼文を自動再送しません。見積要求ID: " + quoteRequestId); });
            }
        });
    }

    private void applyCloudServiceHome(JSONObject home) {
        String state = home.optString("state", "ready");
        if ("not_linked".equals(state)) {
            cloudTaskHandler.removeCallbacks(cloudTaskRefresh);
            entitlementClaimPanel.setVisibility(View.GONE);
            entitlementClaimPackageInput.setText("");
            cloudServiceHomeStatus.setText("クラウドの状態を確認するにはRockstarアカウント連携が必要です。");
            return;
        }
        if (!"ready".equals(state)) {
            cloudTaskHandler.removeCallbacks(cloudTaskRefresh);
            entitlementClaimPanel.setVisibility(View.GONE);
            cloudServiceHomeStatus.setText("クラウドの状態を取得できません。オンライン状態を確認して再試行してください。");
            return;
        }
        entitlementClaimPanel.setVisibility(home.optBoolean("claimRedemptionAvailable") ? View.VISIBLE : View.GONE);
        renderCloudA2AParentJobs(home.optJSONArray("parentJobs"));
        JSONObject access = home.optJSONObject("access");
        JSONArray llm = home.optJSONArray("recentLlm");
        JSONArray agents = home.optJSONArray("recentAgents");
        boolean activeCloudWork = false;
        cloudTaskActions.removeAllViews();
        StringBuilder text = new StringBuilder();
        text.append("利用可能: Sky ").append(yes(access, "sky"))
            .append(" / Zema ").append(yes(access, "zema"))
            .append(" / Agents ").append(yes(access, "agents"));
        appendServiceEntitlements(text, home.optJSONArray("entitlements"));
        text.append("\nクラウドLLM実行: ").append(home.optJSONObject("execution") != null &&
            home.optJSONObject("execution").optBoolean("invoiceVerified") ? "利用可能" : "準備中（課金未検証）");
        text.append("\n最近のクラウドLLM: ");
        int shown = 0;
        if (llm != null) for (int i = 0; i < llm.length() && shown < 5; i++) {
            JSONObject item = llm.optJSONObject(i); if (item == null) continue;
            if (isCloudWorkActive(item.optString("queueState", item.optString("state")))) activeCloudWork = true;
            JSONObject rates = item.optJSONObject("rateCard");
            text.append("\n• ").append(item.optString("state"))
                .append(" — ").append(item.optString("model"))
                .append(" — 上限 ").append(UsageCurrencyFormatter.formatMinor(
                    item.optLong("maximumChargeMinor", 0), item.optString("currency"), java.util.Locale.getDefault()));
            text.append("\n  状態: ").append(llmQueueLabel(item.optString("queueState", "unknown")));
            JSONObject spending = item.optJSONObject("spending");
            if (spending != null && "usage_not_yet_final".equals(spending.optString("status"))) {
                if ("stream_estimate".equals(spending.optString("providerMeter")) &&
                        spending.has("currentEstimateMinor") && !spending.isNull("currentEstimateMinor"))
                    text.append(" / 実行中の暫定見積 ").append(UsageCurrencyFormatter.formatMinor(
                        spending.optLong("currentEstimateMinor"), spending.optString("currency", item.optString("currency")),
                        java.util.Locale.getDefault())).append("（Provider確定meterではありません）");
                else text.append(" / 実行中のProvider使用額は未報告");
                text.append("、予約上限 ").append(UsageCurrencyFormatter.formatMinor(
                    spending.optLong("reservedMaximumMinor", 0), spending.optString("currency", item.optString("currency")),
                    java.util.Locale.getDefault()));
            }
            else if (spending != null && spending.has("currentChargeMinor") && !spending.isNull("currentChargeMinor"))
                text.append(" / 最終使用額 ").append(UsageCurrencyFormatter.formatMinor(
                    spending.optLong("currentChargeMinor"), spending.optString("currency", item.optString("currency")),
                    java.util.Locale.getDefault())).append("（請求確定ではありません）");
            if (rates != null) text.append(" / 価格版 ").append(rates.optString("pricingVersion"));
            JSONObject price = item.optJSONObject("itemizedPrice");
            if (price != null && "priced".equals(price.optString("status")))
                text.append(" / 算定額 ").append(UsageCurrencyFormatter.formatMinor(
                    price.optLong("chargeMinor", 0), price.optString("currency"), java.util.Locale.getDefault()))
                    .append("（請求確定ではありません）");
            if (rates != null) {
                text.append("\n  単価 / 100万 tokens: 入力 ").append(UsageCurrencyFormatter.formatRatePerMillionTokens(
                    rates.optLong("inputMinorMicrosPerMillionTokens", -1), rates.optString("currency"), java.util.Locale.getDefault()))
                    .append("、出力 ").append(UsageCurrencyFormatter.formatRatePerMillionTokens(
                        rates.optLong("outputMinorMicrosPerMillionTokens", -1), rates.optString("currency"), java.util.Locale.getDefault()));
            }
            if (item.optBoolean("resultSaved")) {
                text.append("\n  成果: ");
                String result = item.optString("result", "");
                text.append(result.length() > 500 ? result.substring(0, 500) + "…" : result);
            }
            shown++;
        }
        if (shown == 0) text.append("まだありません");
        int llmButtons = llm == null ? 0 : Math.min(5, llm.length());
        for (int i = 0; i < llmButtons; i++) {
            JSONObject item = llm.optJSONObject(i); if (item == null) continue;
            String id = item.optString("id", "");
            if (!id.isEmpty()) button(cloudTaskActions,
                "LLM明細・保存成果を開く — " + item.optString("model"),
                () -> fetchCloudTaskDetail("llm", id));
        }
        text.append("\n最近のAgent作業: ");
        shown = 0;
        if (agents != null) for (int i = 0; i < agents.length() && shown < 5; i++) {
            JSONObject item = agents.optJSONObject(i); if (item == null) continue;
            if (isCloudWorkActive(item.optString("remoteState", item.optString("state")))) activeCloudWork = true;
            text.append("\n• ").append(item.optString("agentName"))
                .append(" — ").append(item.optString("remoteState", item.optString("state")));
            if (!item.isNull("liveCumulativeAmountMinor"))
                text.append(" — 実行中 ").append(UsageCurrencyFormatter.formatMinor(
                    item.optLong("liveCumulativeAmountMinor"), item.optString("liveUsageCurrency"), java.util.Locale.getDefault()))
                    .append("（暫定provider報告額）");
            String id = item.optString("id", "");
            if (!id.isEmpty()) {
                button(cloudTaskActions, item.optString("agentName") + " の状態・使用量を開く",
                    () -> fetchCloudTaskDetail("agent-status", id));
                button(cloudTaskActions, item.optString("agentName") + " の成果を取得",
                    () -> fetchCloudTaskDetail("agent-result", id));
            }
            shown++;
        }
        if (shown == 0) text.append("まだありません");
        cloudServiceHomeStatus.setText(text.toString());
        cloudTaskHandler.removeCallbacks(cloudTaskRefresh);
        if (activityResumed && activeCloudWork) {
            int seconds = home.optInt("refreshAfterSeconds", 15);
            long delay = Math.max(10, Math.min(seconds, 120)) * 1000L;
            cloudTaskHandler.postDelayed(cloudTaskRefresh, delay);
        }
    }

    private static void appendServiceEntitlements(StringBuilder text, JSONArray entitlements) {
        text.append("\nRockstarOSサービス利用権: ");
        if (entitlements == null || entitlements.length() == 0) {
            text.append("このRockstar IDに登録なし（上の欄から購入claimを登録）");
            return;
        }
        int shown = Math.min(entitlements.length(), 5);
        for (int i = 0; i < shown; i++) {
            JSONObject item = entitlements.optJSONObject(i);
            if (item == null) continue;
            if (i > 0) text.append("; ");
            text.append(safeDisplayValue(item.optString("offerId", "SIM/eSIM"), 48))
                .append(" / ").append(entitlementFormFactor(item.optString("formFactor", "unknown")))
                .append(" / ").append(safeDisplayValue(item.optString("status", "unknown"), 24));
            JSONArray scopes = item.optJSONArray("scopes");
            if (scopes != null && scopes.length() > 0) {
                text.append(" [");
                int scopeCount = Math.min(scopes.length(), 8);
                for (int j = 0; j < scopeCount; j++) {
                    if (j > 0) text.append("・");
                    text.append(safeDisplayValue(scopes.optString(j, ""), 24));
                }
                text.append("]");
            }
            JSONObject profile = item.optJSONObject("serviceProfile");
            if (profile != null && "ready".equals(profile.optString("state"))) {
                text.append(" / 初期Agent構成 ")
                    .append(safeDisplayValue(profile.optString("label", profile.optString("profileId", "Agent")), 48))
                    .append(" ").append(safeDisplayValue(profile.optString("version", ""), 24));
                JSONArray packages = profile.optJSONArray("packages");
                if (packages != null) {
                    int count = Math.min(packages.length(), 3);
                    for (int j = 0; j < count; j++) {
                        JSONObject pack = packages.optJSONObject(j);
                        if (pack == null) continue;
                        text.append(j == 0 ? " [" : "・")
                            .append(safeDisplayValue(pack.optString("name", pack.optString("packageKey", "Package")), 48));
                    }
                    if (packages.length() > 0) text.append("]");
                    if (profile.optInt("packageCount", packages.length()) > count)
                        text.append(" 他").append(profile.optInt("packageCount", packages.length()) - count).append("件");
                }
                text.append("（端末への導入・実行は本人確認後）");
            } else if (profile != null && "review_required".equals(profile.optString("state"))) {
                text.append(" / 初期Agent構成のPackage要確認");
            }
        }
        if (entitlements.length() > shown) text.append("; 他").append(entitlements.length() - shown).append("件");
    }

    private void confirmEntitlementClaim() {
        String packageJson = entitlementClaimPackageInput.getText().toString().trim();
        try {
            if (packageJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 16_384)
                throw new IllegalArgumentException("size");
            JSONObject envelope = new JSONObject(packageJson);
            JSONObject claim = envelope.optJSONObject("claim");
            String claimCode = envelope.optString("claimCode", "");
            if (envelope.length() != 2 || claim == null || !claimCode.matches("rsk_[A-Za-z0-9_-]{32,96}"))
                throw new IllegalArgumentException("shape");
            String offer = safeDisplayValue(claim.optString("offerId", "SIM/eSIMサービス"), 48);
            new android.app.AlertDialog.Builder(this)
                .setTitle("購入利用権を登録")
                .setMessage("Offer: " + offer + "\n\nこのclaimは一度登録するとこのRockstar IDに結び付きます。通信回線の開通やOSの導入は別状態です。")
                .setNegativeButton("戻る", null)
                .setPositiveButton("このIDに登録", (dialog, which) -> submitEntitlementClaim(packageJson))
                .show();
        } catch (Exception invalid) {
            entitlementClaimStatus.setText("購入claimの形式を確認してください。claimCodeは販売元から受け取ったJSONに含めてください。");
        }
    }

    private void submitEntitlementClaim(String packageJson) {
        entitlementClaimStatus.setText("Rockstar IDと署名を確認しています。結果不明時は自動再送しません…");
        worker.execute(() -> {
            try {
                JSONObject result = new JSONObject(new ShellConnection(this).claimRockstarServiceEntitlement(packageJson));
                String state = result.optString("state", "unknown");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    if ("registered".equals(state)) {
                        entitlementClaimPackageInput.setText("");
                        entitlementClaimStatus.setText(result.optBoolean("alreadyClaimed")
                            ? "このRockstar IDには登録済みです。"
                            : "利用権を登録しました。通信開通・端末OS導入とは別に確認できます。");
                        refreshCloudServiceHome();
                    } else if ("claim_rejected".equals(state)) {
                        entitlementClaimStatus.setText("claimが無効・期限切れ・別のRockstar IDで登録済みの可能性があります。販売元へ確認してください。");
                    } else if ("not_linked".equals(state)) {
                        entitlementClaimStatus.setText("Rockstar IDの有効な端末連携を確認できません。再接続してから、同じclaimを明示的に再試行できます。");
                    } else if ("invalid_package".equals(state)) {
                        entitlementClaimStatus.setText("購入claimのJSON形式を確認してください。");
                    } else {
                        entitlementClaimStatus.setText("接続または登録結果を確認できません。自動再送はしていません。同じclaimで状態を再確認してください。");
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    if (!isDestroyed()) entitlementClaimStatus.setText(
                        "登録結果を確認できません。自動再送はしていません。同じclaimはこのRockstar IDから明示的に再試行できます。");
                });
            }
        });
    }

    private static String entitlementFormFactor(String value) {
        switch (value) {
            case "physical_sim": return "物理SIM";
            case "esim": return "eSIM";
            case "service_only": return "サービス利用権のみ";
            default: return "種別確認中";
        }
    }

    private static String safeDisplayValue(String value, int maximumLength) {
        if (value == null || value.isEmpty()) return "不明";
        String compact = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return compact.length() > maximumLength ? compact.substring(0, maximumLength) + "…" : compact;
    }

    private static boolean isCloudWorkActive(String state) {
        return state != null && !state.isEmpty() &&
            !java.util.Set.of("completed", "remote_completed", "failed", "remote_failed",
                "rejected", "remote_rejected", "cancelled", "remote_cancelled",
                "cancelled_before_dispatch", "expired", "awaiting_approval", "not_running")
                .contains(state);
    }

    private void renderCloudA2AParentJobs(JSONArray parentJobs) {
        cloudA2aParentList.removeAllViews();
        boolean selectedStillAvailable = false;
        if (parentJobs == null || parentJobs.length() == 0) {
            cloudA2aSelectedParentId = null;
            cloudA2aSelectedParentTitle = null;
            cloudA2aParentSelection.setText("親job未選択");
            label(cloudA2aParentList, "委任可能な実行中・レビュー中のZema jobがありません。", 13);
            updateA2APrepareButton();
            return;
        }
        for (int i = 0; i < parentJobs.length() && i < 20; i++) {
            JSONObject job = parentJobs.optJSONObject(i);
            if (job == null) continue;
            String id = job.optString("id", "");
            String title = job.optString("title", "Zema job");
            String status = job.optString("status", "unknown");
            if (id.isEmpty()) continue;
            if (id.equals(cloudA2aSelectedParentId)) selectedStillAvailable = true;
            button(cloudA2aParentList, title + " / " + status + (id.equals(cloudA2aSelectedParentId) ? " ✓" : ""), () -> {
                cloudA2aSelectedParentId = id;
                cloudA2aSelectedParentTitle = title;
                cloudA2aParentSelection.setText("選択中: " + title + " / " + status);
                renderCloudA2AParentJobs(parentJobs);
            });
        }
        if (!selectedStillAvailable) {
            cloudA2aSelectedParentId = null;
            cloudA2aSelectedParentTitle = null;
            cloudA2aParentSelection.setText("親job未選択");
        }
        updateA2APrepareButton();
    }

    private void updateA2APrepareButton() {
        boolean quoteReady = cloudA2aVerifiedQuote != null && cloudA2aQuotedPrompt != null &&
            cloudA2aQuotedAgentId != null && cloudA2aVerifiedQuote.optBoolean("verified") &&
            cloudA2aVerifiedQuote.optBoolean("quoteOnly") && !cloudA2aVerifiedQuote.optBoolean("executionAuthorized") &&
            cloudA2aVerifiedQuote.optLong("expiresAt", 0) > System.currentTimeMillis();
        cloudA2aPrepareDraftButton.setVisibility(quoteReady && cloudA2aSelectedParentId != null ? View.VISIBLE : View.GONE);
    }

    private void prepareCloudA2ADelegation() {
        updateA2APrepareButton();
        if (cloudA2aPrepareDraftButton.getVisibility() != View.VISIBLE || cloudA2aVerifiedQuote == null) {
            cloudA2aQuoteStatus.setText("有効な署名済み見積と親jobを選んでください。");
            return;
        }
        String prompt = cloudA2aPrompt.getText().toString();
        if (!prompt.equals(cloudA2aQuotedPrompt) || !cloudA2aQuoteDisclosureConsent.isChecked()) {
            cloudA2aQuoteStatus.setText("見積後に依頼文が変更されています。依頼文の共有同意を確認し、見積を取り直してください。");
            return;
        }
        String currency = cloudA2aQuotedCurrency;
        long childCap = cloudA2aQuotedBudgetMinor;
        Long parentCap = UsageCurrencyFormatter.parseMajorToMinor(cloudA2aParentBudget.getText().toString(), currency);
        if (parentCap == null || parentCap < childCap) {
            cloudA2aQuoteStatus.setText("親jobの上限は見積通貨で入力し、この依頼の上限以上にしてください。");
            return;
        }
        try {
            JSONObject quote = new JSONObject();
            for (String key : new String[] {"schema", "providerId", "keyId", "quoteId", "agentOrigin",
                    "agentName", "agentVersion", "requestSha256", "pricingVersion", "pricingSha256",
                    "currency", "estimateMinor", "maxAmountMinor", "issuedAt", "expiresAt", "usage", "signature"})
                if (cloudA2aVerifiedQuote.has(key)) quote.put(key, cloudA2aVerifiedQuote.get(key));
            long deadlineAt = quote.getLong("expiresAt");
            String id = UUID.randomUUID().toString();
            String messageId = UUID.randomUUID().toString();
            String idempotencyKey = UUID.randomUUID().toString();
            String inputSha = sha256(prompt);
            JSONObject draft = new JSONObject();
            draft.put("id", id); draft.put("parentJobId", cloudA2aSelectedParentId);
            draft.put("idempotencyKey", idempotencyKey); draft.put("messageId", messageId);
            draft.put("agentId", cloudA2aQuotedAgentId); draft.put("message", prompt);
            draft.put("budgetCurrency", currency); draft.put("budgetLimitMinor", childCap);
            draft.put("parentBudgetLimitMinor", parentCap); draft.put("deadlineAt", deadlineAt);
            draft.put("priceQuote", quote);
            saveA2ARecovery(cloudA2aSelectedParentId, idempotencyKey, inputSha);
            cloudA2aQuoteStatus.setText("条件をBrokerで再検証し、Cloudに未実行の委任案を保存中…");
            cloudA2aPrepareDraftButton.setEnabled(false);
            worker.execute(() -> {
                try {
                    JSONObject response = new JSONObject(new ShellConnection(this).prepareCloudA2ADelegation(draft.toString()));
                    boolean saved = response.optBoolean("nativeTermsVerified") &&
                        !response.optBoolean("executionStarted") && "awaiting_approval".equals(
                            response.optJSONObject("delegation") == null ? "" : response.optJSONObject("delegation").optString("state"));
                    runOnUiThread(() -> {
                        if (isDestroyed()) return;
                        cloudA2aPrepareDraftButton.setEnabled(true);
                        if (saved) {
                            clearA2ARecovery();
                            JSONObject delegation = response.optJSONObject("delegation");
                            cloudA2aCurrentDraft = draft;
                            cloudA2aWalletApprovalId = null;
                            cloudA2aHeldDelegationId = null;
                            cloudA2aPaidExecutionConsent.setChecked(false);
                            cloudA2aPaidExecutionConsent.setVisibility(View.VISIBLE);
                            cloudA2aWalletApprovalButton.setVisibility(View.VISIBLE);
                            cloudA2aWalletReserveButton.setVisibility(View.GONE);
                            cloudA2aWalletReleaseButton.setVisibility(View.GONE);
                            cloudA2aExecutionConsent.setChecked(false);
                            cloudA2aExecutionConsent.setVisibility(View.GONE);
                            cloudA2aBrokerProofButton.setVisibility(View.GONE);
                            cloudA2aQuoteStatus.setText("委任案をCloudに保存しました（" + delegation.optString("id") + "）。状態: 承認待ち。Agent実行・Wallet予約・請求はまだ行っていません。Wallet予約を希望する場合は、チェック後に別途端末承認してください。");
                            refreshCloudServiceHome();
                        } else if (response.optBoolean("recoveryRequired") || "unknown".equals(response.optString("state"))) {
                            cloudA2aQuoteStatus.setText("保存結果を確認できません。再送せず、同じ照合キーで保存状態を確認してください。");
                            cloudA2aRecoverDraftButton.setVisibility(View.VISIBLE);
                        } else {
                            clearA2ARecovery();
                            cloudA2aQuoteStatus.setText("委任案を保存できませんでした。上限、利用権、親job状態、見積有効期限を確認してください。Agentへの送信は行っていません。");
                        }
                    });
                } catch (Exception failure) {
                    runOnUiThread(() -> {
                        if (isDestroyed()) return;
                        cloudA2aPrepareDraftButton.setEnabled(true);
                        cloudA2aQuoteStatus.setText("応答を受け取れませんでした。委任案を再作成せず、同じ照合キーで保存状態を確認してください。");
                        cloudA2aRecoverDraftButton.setVisibility(View.VISIBLE);
                    });
                }
            });
        } catch (Exception invalid) {
            cloudA2aQuoteStatus.setText("見積条件を読み取れません。Agentを選び直して見積を取得してください。");
        }
    }

    private void requestCloudA2AWalletApproval() {
        if (cloudA2aCurrentDraft == null || !cloudA2aPaidExecutionConsent.isChecked()) {
            cloudA2aQuoteStatus.setText("Wallet上限の予約を希望するチェックを入れてください。Cloud実行は承認されません。");
            return;
        }
        cloudA2aWalletApprovalButton.setEnabled(false);
        cloudA2aQuoteStatus.setText("Cloudの未実行委任案と署名済み見積を再照合し、端末内Wallet上限の本人承認を準備中…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .requestCloudA2AWalletReservation(cloudA2aCurrentDraft.toString()));
                String state = response.optString("state");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aWalletApprovalButton.setEnabled(true);
                    if ("awaiting_owner_confirmation".equals(state) || "owner_confirmed".equals(state)) {
                        cloudA2aWalletApprovalId = response.optString("approvalId", null);
                        cloudA2aWalletReserveButton.setVisibility(View.VISIBLE);
                        cloudA2aQuoteStatus.setText(("owner_confirmed".equals(state) ? "端末で本人承認済みです。" : "見積上限 " +
                            formatMoney(response.optLong("maximumMinor"), response.optString("currency")) +
                            " のWallet予約を端末の本人確認画面で承認してください。") +
                            "確認後に「Wallet上限を予約」を押します。Cloud実行・請求はまだありません。");
                    } else {
                        cloudA2aQuoteStatus.setText("Wallet予約の本人承認を準備できませんでした（" + safeState(state) + "）。Cloud実行は行っていません。");
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) {
                    cloudA2aWalletApprovalButton.setEnabled(true);
                    cloudA2aQuoteStatus.setText("本人承認の準備結果を確認できません。状態を照合してから再操作してください。Cloud実行は行っていません。");
                }});
            }
        });
    }

    private void confirmCloudA2AWalletReservation() {
        if (cloudA2aCurrentDraft == null || cloudA2aWalletApprovalId == null ||
                !cloudA2aPaidExecutionConsent.isChecked()) {
            cloudA2aQuoteStatus.setText("Wallet予約には、保存済み委任案、本人承認、予約希望の確認が必要です。");
            return;
        }
        cloudA2aWalletReserveButton.setEnabled(false);
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this).confirmCloudA2AWalletReservation(
                    cloudA2aCurrentDraft.toString(), cloudA2aWalletApprovalId));
                String state = response.optString("state");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aWalletReserveButton.setEnabled(true);
                    if ("reserved".equals(state) && !response.optBoolean("executionStarted")) {
                        cloudA2aHeldDelegationId = response.optString("delegationId", null);
                        cloudA2aWalletReleaseButton.setVisibility(View.VISIBLE);
                        cloudA2aExecutionConsent.setText("この依頼をCloud Agentへ渡し、圏外でも継続することに同意する（上限 " +
                            formatMoney(response.optLong("heldMinor"), response.optString("currency")) + "）。Cloud実行開始は次の別承認です。");
                        cloudA2aExecutionConsent.setChecked(false);
                        cloudA2aExecutionConsent.setVisibility(View.VISIBLE);
                        cloudA2aBrokerProofButton.setVisibility(View.VISIBLE);
                        cloudA2aQuoteStatus.setText("Walletに " + formatMoney(response.optLong("heldMinor"), response.optString("currency")) +
                            " を予約しました。これは支払い確定でもCloud実行でもありません。実行開始にはCloud側の明示承認・Broker証明・実行接続が別途必要です。");
                    } else {
                        cloudA2aQuoteStatus.setText("Wallet予約は完了していません（" + safeState(state) + "）。Cloud実行は行っていません。");
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) {
                    cloudA2aWalletReserveButton.setEnabled(true);
                    cloudA2aQuoteStatus.setText("Wallet予約の結果を確定できません。再予約せず、同じ委任案で状態を再照合してください。");
                }});
            }
        });
    }

    private void releaseCloudA2AWalletReservation() {
        if (cloudA2aHeldDelegationId == null) return;
        cloudA2aWalletReleaseButton.setEnabled(false);
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .releaseCloudA2AWalletReservation(cloudA2aHeldDelegationId));
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aWalletReleaseButton.setEnabled(true);
                    if ("released".equals(response.optString("state"))) {
                        cloudA2aHeldDelegationId = null;
                        cloudA2aWalletReleaseButton.setVisibility(View.GONE);
                        cloudA2aExecutionConsent.setChecked(false);
                        cloudA2aExecutionConsent.setVisibility(View.GONE);
                        cloudA2aBrokerProofButton.setVisibility(View.GONE);
                        cloudA2aQuoteStatus.setText("Cloud実行前のWallet予約を解除しました。Cloud実行・請求は行っていません。");
                    } else cloudA2aQuoteStatus.setText("Wallet予約を解除できませんでした（" + safeState(response.optString("state")) + "）。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) {
                    cloudA2aWalletReleaseButton.setEnabled(true);
                    cloudA2aQuoteStatus.setText("Wallet予約の解除結果を確認できません。状態を再照合してください。");
                }});
            }
        });
    }

    private void registerCloudA2ABrokerAuthorization() {
        if (cloudA2aCurrentDraft == null || cloudA2aHeldDelegationId == null ||
                !cloudA2aExecutionConsent.isChecked()) {
            cloudA2aQuoteStatus.setText("Cloud Agent実行と圏外中の継続を許可する場合だけ、別途同意してください。");
            return;
        }
        cloudA2aBrokerProofButton.setEnabled(false);
        cloudA2aQuoteStatus.setText("同じdelegation ID・見積・Wallet hold・端末鍵を照合し、Cloud Broker証明を登録しています。これはAgentへ送信せず、実行も開始しません…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .registerCloudA2ABrokerAuthorization(cloudA2aCurrentDraft.toString()));
                String state = response.optString("state");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aBrokerProofButton.setEnabled(true);
                    if ("broker_proof_registered".equals(state) && !response.optBoolean("executionStarted")) {
                        cloudA2aBrokerProofButton.setVisibility(View.GONE);
                        cloudA2aFinalApprovalButton.setVisibility(View.VISIBLE);
                        cloudA2aQuoteStatus.setText("端末署名Broker証明を同じ委任IDへ登録しました。まだAgentへの依頼送信・実行・利用料確定は行っていません。Cloudに渡す最終承認は別操作です。");
                    } else if (response.optBoolean("recoveryRequired")) {
                        cloudA2aQuoteStatus.setText("Broker証明の登録結果が未確認です。同じ委任IDのCloud状態を読み取り照合してから再操作してください。再送・実行はしていません。");
                    } else cloudA2aQuoteStatus.setText("Broker証明を登録できませんでした（" + safeState(state) + "）。Cloud実行は行っていません。");
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) {
                    cloudA2aBrokerProofButton.setEnabled(true);
                    cloudA2aQuoteStatus.setText("Broker証明の登録結果を確認できません。再送せず、同じ委任IDの登録状態を読み取り確認してください。");
                }});
            }
        });
    }

    private void confirmCloudA2AExecution() {
        if (cloudA2aCurrentDraft == null || cloudA2aHeldDelegationId == null ||
                !cloudA2aHeldDelegationId.equals(cloudA2aCurrentDraft.optString("id")) ||
                !cloudA2aExecutionConsent.isChecked()) {
            cloudA2aQuoteStatus.setText("同じ委任案・Wallet予約・圏外継続への同意を確認できません。");
            return;
        }
        long capMinor = cloudA2aCurrentDraft.optLong("budgetLimitMinor", -1);
        String currency = cloudA2aCurrentDraft.optString("currency", "");
        new AlertDialog.Builder(this)
            .setTitle("Cloud作業を最終承認")
            .setMessage("この依頼をCloud Agentへ送信します。端末が圏外でも作業は続き、再接続後に状態と結果を取得できます。\n\nWallet上限: " +
                formatMoney(capMinor, currency) + "\n親job全体の上限: " +
                formatMoney(cloudA2aCurrentDraft.optLong("parentBudgetLimitMinor", -1), currency) +
                "\n上限超過には別の明示承認が必要です。")
            .setNegativeButton("戻る", null)
            .setPositiveButton("この上限でCloud作業を承認", (dialog, which) -> submitCloudA2AExecutionApproval())
            .show();
    }

    private void submitCloudA2AExecutionApproval() {
        cloudA2aFinalApprovalButton.setEnabled(false);
        cloudA2aQuoteStatus.setText("同じ委任IDをCloudへ一度だけ承認要求しています。結果不明時も自動再送しません…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .approveCloudA2ADelegation(cloudA2aCurrentDraft.toString()));
                runOnUiThread(() -> renderCloudA2AExecutionState(response));
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aFinalApprovalButton.setEnabled(false);
                    cloudA2aExecutionRecoveryButton.setVisibility(View.VISIBLE);
                    cloudA2aQuoteStatus.setText("Cloud承認の結果を確認できません。二重実行を防ぐため再送せず、同じ委任IDの状態を読み取り確認してください。");
                });
            }
        });
    }

    private void recoverCloudA2AExecution() {
        if (cloudA2aCurrentDraft == null || cloudA2aHeldDelegationId == null) {
            cloudA2aQuoteStatus.setText("状態照合に必要な委任IDがありません。");
            return;
        }
        cloudA2aExecutionRecoveryButton.setEnabled(false);
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .recoverCloudA2AExecution(cloudA2aCurrentDraft.toString()));
                runOnUiThread(() -> {
                    cloudA2aExecutionRecoveryButton.setEnabled(true);
                    renderCloudA2AExecutionState(response);
                });
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudA2aExecutionRecoveryButton.setEnabled(true);
                    cloudA2aQuoteStatus.setText("照合できませんでした。再送せず、通信復旧後に同じ委任IDを再照合してください。");
                });
            }
        });
    }

    private void renderCloudA2AExecutionState(JSONObject response) {
        if (isDestroyed()) return;
        String state = response.optString("state", "unknown");
        if ("cloud_accepted".equals(state)) {
            cloudA2aFinalApprovalButton.setVisibility(View.GONE);
            cloudA2aExecutionRecoveryButton.setVisibility(View.VISIBLE);
            cloudA2aWalletReleaseButton.setVisibility(View.GONE);
            cloudA2aQuoteStatus.setText("Cloudが承認を受理しました（" + safeState(response.optString("cloudState")) + "）。端末側Wallet上限を「" +
                safeState(response.optString("walletState")) + "」として保護しています。これはProvider請求の実証ではありません。状態・明細は再接続後も同じ委任IDで照合できます。");
        } else if ("awaiting_cloud_approval".equals(state)) {
            cloudA2aExecutionRecoveryButton.setVisibility(View.GONE);
            cloudA2aFinalApprovalButton.setVisibility(View.VISIBLE);
            cloudA2aFinalApprovalButton.setEnabled(true);
            cloudA2aQuoteStatus.setText("Cloudはまだ承認を受理していません。読み取り照合のみで、実行・請求は確認されていません。実行する場合はボタンから明示的に承認してください。");
        } else if ("cloud_not_dispatched".equals(state)) {
            cloudA2aExecutionRecoveryButton.setVisibility(View.GONE);
            cloudA2aFinalApprovalButton.setVisibility(View.GONE);
            cloudA2aWalletReleaseButton.setVisibility(View.VISIBLE);
            cloudA2aQuoteStatus.setText("Cloud状態は " + safeState(response.optString("cloudState")) + " で、実行開始前に終了しています。Wallet予約の解除が可能です。");
        } else if ("unknown".equals(state)) {
            cloudA2aFinalApprovalButton.setVisibility(View.GONE);
            cloudA2aExecutionRecoveryButton.setVisibility(View.VISIBLE);
            cloudA2aWalletReleaseButton.setVisibility(View.GONE);
            cloudA2aQuoteStatus.setText("Cloud承認結果は未確定です。Wallet上限を解放せず保持しています。再送せず、同じ委任IDの状態を照合してください。");
        } else {
            cloudA2aFinalApprovalButton.setEnabled(true);
            cloudA2aQuoteStatus.setText("Cloud承認状態を確認できません（" + safeState(state) + "）。実行の有無は未確認です。");
        }
    }

    private String formatMoney(long minor, String currency) {
        return UsageCurrencyFormatter.formatMinor(minor, currency, Locale.JAPAN);
    }

    private static String safeState(String state) {
        return state == null || !state.matches("[A-Za-z0-9_-]{1,48}") ? "unknown" : state;
    }

    private void recoverCloudA2ADelegation() {
        if (cloudA2aRecoveryParentId == null || cloudA2aRecoveryIdempotencyKey == null || cloudA2aRecoveryInputSha256 == null) {
            cloudA2aQuoteStatus.setText("照合用情報がありません。未確認の作業を再送せず、親jobの状態を更新してください。");
            return;
        }
        cloudA2aQuoteStatus.setText("同じ親job・冪等キー・入力hashで保存状態を照合中（読み取りのみ）…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this).recoverCloudA2ADelegation(
                    cloudA2aRecoveryParentId, cloudA2aRecoveryIdempotencyKey, cloudA2aRecoveryInputSha256));
                JSONObject delegation = response.optJSONObject("delegation");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    if (delegation == null) {
                        cloudA2aQuoteStatus.setText("Cloudに一致する委任案は見つかりませんでした。自動再送はしません。必要なら新しい見積から作成してください。");
                        return;
                    }
                    String state = delegation.optString("state", "unknown");
                    cloudA2aQuoteStatus.setText("委任案を照合しました: " + delegation.optString("id") + " / " + state +
                        ("awaiting_approval".equals(state) ? "。まだ実行されていません。" : "。Cloud側で状態が進んでいるため、再承認・再送は行いません。"));
                    clearA2ARecovery();
                    refreshCloudServiceHome();
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) cloudA2aQuoteStatus.setText(
                    "照合できませんでした。キーを維持しました。通信復旧後に同じ照合を再試行してください。"); });
            }
        });
    }

    private void restoreA2ARecovery() {
        android.content.SharedPreferences preferences = getSharedPreferences("a2a_delegation_recovery", MODE_PRIVATE);
        cloudA2aRecoveryParentId = preferences.getString("parentJobId", null);
        cloudA2aRecoveryIdempotencyKey = preferences.getString("idempotencyKey", null);
        cloudA2aRecoveryInputSha256 = preferences.getString("inputSha256", null);
        boolean pending = cloudA2aRecoveryParentId != null && cloudA2aRecoveryIdempotencyKey != null && cloudA2aRecoveryInputSha256 != null;
        cloudA2aRecoverDraftButton.setVisibility(pending ? View.VISIBLE : View.GONE);
        if (pending && cloudA2aQuoteStatus != null)
            cloudA2aQuoteStatus.setText("前回の委任案の結果が未確認です。再送せず、保存状態を照合してください。");
    }

    private void saveA2ARecovery(String parentId, String idempotency, String inputSha) {
        cloudA2aRecoveryParentId = parentId; cloudA2aRecoveryIdempotencyKey = idempotency; cloudA2aRecoveryInputSha256 = inputSha;
        boolean persisted = getSharedPreferences("a2a_delegation_recovery", MODE_PRIVATE).edit().putString("parentJobId", parentId)
            .putString("idempotencyKey", idempotency).putString("inputSha256", inputSha).commit();
        if (!persisted) throw new IllegalStateException("A2A_RECOVERY_KEY_PERSIST_FAILED");
        cloudA2aRecoverDraftButton.setVisibility(View.VISIBLE);
    }

    private void clearA2ARecovery() {
        cloudA2aRecoveryParentId = null; cloudA2aRecoveryIdempotencyKey = null; cloudA2aRecoveryInputSha256 = null;
        getSharedPreferences("a2a_delegation_recovery", MODE_PRIVATE).edit().clear().apply();
        cloudA2aRecoverDraftButton.setVisibility(View.GONE);
    }

    private static String sha256(String value) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(64);
        for (byte item : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return hex.toString();
    }

    private void fetchCloudTaskDetail(String kind, String id) {
        cloudTaskDetailStatus.setText("選択したクラウド作業の情報を取得中…");
        cloudTaskDetailActions.removeAllViews();
        worker.execute(() -> {
            try {
                String response = new ShellConnection(this).cloudTaskDetail(kind, id);
                JSONObject parsed = new JSONObject(response);
                String rendered = formatCloudTaskDetail(kind, parsed);
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        cloudTaskDetailStatus.setText(rendered);
                        renderCloudTaskDetailActions(kind, id, parsed);
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) cloudTaskDetailStatus.setText(
                    "情報を取得できません。通信、アカウント連携、または成果の有無を確認してください。"); });
            }
        });
    }

    private void renderCloudTaskDetailActions(String kind, String id, JSONObject detail) {
        cloudTaskDetailActions.removeAllViews();
        if (!"agent-status".equals(kind)) return;
        JSONObject delegation = detail.optJSONObject("delegation");
        if (delegation == null) return;
        button(cloudTaskDetailActions, "状態・利用量を読み直す", () -> fetchCloudTaskDetail(kind, id));
        String state = delegation.optString("state", "unknown");
        if (java.util.Set.of("awaiting_approval", "prepared", "dispatching", "dispatch_submitting",
                "indeterminate", "submitted", "working", "awaiting_remote_input", "cancel_requested",
                "cancel_submitting", "cancel_unconfirmed").contains(state))
            button(cloudTaskDetailActions, "同じ委任IDのCloud・端末Wallet状態を照合",
                () -> recoverCloudA2AFromTaskDetail(id));
        if (!java.util.Set.of("awaiting_approval", "prepared", "dispatching", "dispatch_submitting",
                "indeterminate", "submitted", "working", "awaiting_remote_input").contains(state)) return;
        button(cloudTaskDetailActions, "Cloud作業の停止を依頼", () -> confirmCloudA2ACancellation(id));
    }

    private void recoverCloudA2AFromTaskDetail(String delegationId) {
        cloudTaskDetailStatus.setText("同じ委任IDのCloud状態と端末に保存されたWallet予約を照合中（読み取りのみ）…");
        cloudTaskDetailActions.removeAllViews();
        worker.execute(() -> {
            try {
                JSONObject request = new JSONObject(); request.put("id", delegationId);
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .recoverCloudA2AExecution(request.toString()));
                String state = response.optString("state", "unknown");
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    String detail = "同じ委任ID " + delegationId + " / Cloud " +
                        safeState(response.optString("cloudState")) + " / 端末Wallet " +
                        safeState(response.optString("walletState"));
                    if ("awaiting_cloud_approval".equals(state)) {
                        cloudTaskDetailStatus.setText(detail + "。Cloud実行開始前です。元の予算予約は確認済みで、再送・再承認はしていません。");
                    } else if ("cloud_accepted".equals(state)) {
                        cloudTaskDetailStatus.setText(detail + "。同じCloud作業を照合しました。Wallet予約の状態を同期し、再送はしていません。");
                    } else if ("cloud_not_dispatched".equals(state)) {
                        cloudTaskDetailStatus.setText(detail + "。Cloud側では実行開始前に終了しています。Wallet予約はまだ解除していません。");
                        button(cloudTaskDetailActions, "実行前のWallet予約を解除",
                            () -> releaseRecoveredA2ABudget(delegationId));
                    } else {
                        cloudTaskDetailStatus.setText(detail + "。条件または状態を照合できないため、予約を保持して再送しません。後で同じIDを再確認してください。");
                    }
                    button(cloudTaskDetailActions, "状態・利用量を読み直す", () -> fetchCloudTaskDetail("agent-status", delegationId));
                });
            } catch (Exception unavailable) {
                runOnUiThread(() -> { if (!isDestroyed()) cloudTaskDetailStatus.setText(
                    "同じ委任IDを照合できませんでした。端末Wallet予約を変更せず、通信復旧後に再試行してください。"); });
            }
        });
    }

    private void releaseRecoveredA2ABudget(String delegationId) {
        cloudTaskDetailStatus.setText("Cloudが未dispatchであることと同じ委任IDのWallet予約を再照合し、予約解除を要求しています…");
        cloudTaskDetailActions.removeAllViews();
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .releaseCloudA2AWalletReservation(delegationId));
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    if ("released".equals(response.optString("state"))) {
                        cloudTaskDetailStatus.setText("実行前のWallet予約を解除しました。Cloud作業の送信・請求は行っていません。");
                        button(cloudTaskDetailActions, "Cloud状態を読み直す",
                            () -> fetchCloudTaskDetail("agent-status", delegationId));
                    } else {
                        cloudTaskDetailStatus.setText("Wallet予約を解除できませんでした（" +
                            safeState(response.optString("state")) + "）。Cloud状態を変更せず予約を保持しています。");
                        button(cloudTaskDetailActions, "状態・利用量を読み直す",
                            () -> fetchCloudTaskDetail("agent-status", delegationId));
                    }
                });
            } catch (Exception unavailable) {
                runOnUiThread(() -> { if (!isDestroyed()) cloudTaskDetailStatus.setText(
                    "解除結果を確認できません。自動再送せず、CloudとWalletを同じ委任IDで再照合してください。"); });
            }
        });
    }

    private void confirmCloudA2ACancellation(String delegationId) {
        new AlertDialog.Builder(this)
            .setTitle("Cloud作業の停止を依頼")
            .setMessage("停止要求をCloudへ一度送ります。要求を受け付けた状態と、相手Agentで停止を確認した状態は別です。結果不明時は自動再送せず、状態を読み直します。利用済み料金が残る場合があります。")
            .setNegativeButton("戻る", null)
            .setPositiveButton("停止を依頼", (dialog, which) -> sendCloudA2ACancellation(delegationId))
            .show();
    }

    private void sendCloudA2ACancellation(String delegationId) {
        cloudTaskDetailActions.removeAllViews();
        cloudTaskDetailStatus.setText("停止要求をCloudへ一度送っています。remote停止は読戻しまで未確認です…");
        worker.execute(() -> {
            try {
                JSONObject response = new JSONObject(new ShellConnection(this)
                    .cancelCloudA2ADelegation(delegationId));
                String state = response.optString("state", "unknown");
                String cloudState = safeState(response.optString("cloudState"));
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    if ("stop_confirmed".equals(state)) {
                        cloudTaskDetailStatus.setText("cancelled_before_dispatch".equals(cloudState)
                            ? "Cloudは送信前に仕事を取り消しました（" + cloudState + "）。Agent実行は始まっていません。"
                            : "相手Agentから停止済み状態「" + cloudState + "」を読み取り確認しました。");
                        button(cloudTaskDetailActions, "最終状態・利用明細を読む", () -> fetchCloudTaskDetail("agent-status", delegationId));
                    } else if ("cancellation_requested".equals(state)) {
                        cloudTaskDetailStatus.setText("Cloudに停止要求を記録しました（" + cloudState + "）。相手Agentの停止はまだ確認できていません。利用量・結果は状態を再取得して確認してください。");
                        button(cloudTaskDetailActions, "停止結果を読み直す", () -> fetchCloudTaskDetail("agent-status", delegationId));
                    } else if ("cancellation_unconfirmed".equals(state) || response.optBoolean("recoveryRequired")) {
                        cloudTaskDetailStatus.setText("停止要求のremote結果は未確認です（" + cloudState + "）。二重操作を避けるため再送しません。読み取りで状態を再確認してください。");
                        button(cloudTaskDetailActions, "状態だけを読み直す", () -> fetchCloudTaskDetail("agent-status", delegationId));
                    } else if ("cancel_not_accepted".equals(state)) {
                        cloudTaskDetailStatus.setText("Cloudで停止要求を確認できませんでした。作業状態「" + cloudState + "」を維持しています。明示的にもう一度依頼するか、状態を読み直してください。");
                        button(cloudTaskDetailActions, "状態を読み直す", () -> fetchCloudTaskDetail("agent-status", delegationId));
                        if (java.util.Set.of("awaiting_approval", "prepared", "dispatching", "dispatch_submitting",
                                "indeterminate", "submitted", "working", "awaiting_remote_input").contains(cloudState))
                            button(cloudTaskDetailActions, "停止を明示的にもう一度依頼", () -> confirmCloudA2ACancellation(delegationId));
                    } else if ("already_terminal".equals(state)) {
                        cloudTaskDetailStatus.setText("作業はすでに終了状態です（" + cloudState + "）。停止要求は追加していません。");
                        button(cloudTaskDetailActions, "最終状態・利用明細を読む", () -> fetchCloudTaskDetail("agent-status", delegationId));
                    } else {
                        cloudTaskDetailStatus.setText("停止結果が不明です。状態「" + cloudState + "」を読み直してください。停止要求は自動再送していません。");
                        button(cloudTaskDetailActions, "状態だけを読み直す", () -> fetchCloudTaskDetail("agent-status", delegationId));
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    cloudTaskDetailStatus.setText("停止要求の応答を確認できません。再送せず、状態を読み直してください。");
                    button(cloudTaskDetailActions, "状態だけを読み直す", () -> fetchCloudTaskDetail("agent-status", delegationId));
                });
            }
        });
    }

    private String formatCloudTaskDetail(String kind, JSONObject root) throws Exception {
        StringBuilder text = new StringBuilder();
        if ("llm".equals(kind)) {
            JSONObject execution = root.optJSONObject("execution");
            if (execution == null) return root.toString(2);
            text.append("クラウドLLMの依頼\n状態: ")
                .append(llmQueueLabel(root.optString("queueState", execution.optString("state", "unknown"))))
                .append("\nモデル: ").append(execution.optJSONObject("quote") == null ? "不明"
                    : execution.optJSONObject("quote").optJSONObject("ceiling") == null ? "不明"
                    : execution.optJSONObject("quote").optJSONObject("ceiling").optString("modelId", "不明"));
            JSONObject spending = execution.optJSONObject("spending");
            if (spending != null) {
                String currency = spending.optString("currency", "USD");
                if (spending.has("reservedMaximumMinor") && spending.optLong("reservedMaximumMinor") > 0)
                    text.append("\n予約上限: ").append(UsageCurrencyFormatter.formatMinor(
                        spending.optLong("reservedMaximumMinor"), currency, java.util.Locale.getDefault()));
                if (spending.has("currentChargeMinor") && !spending.isNull("currentChargeMinor"))
                    text.append("\n最終使用額: ").append(UsageCurrencyFormatter.formatMinor(
                        spending.optLong("currentChargeMinor"), currency, java.util.Locale.getDefault()));
                if ("usage_not_yet_final".equals(spending.optString("status"))) {
                    if ("stream_estimate".equals(spending.optString("providerMeter")) &&
                            spending.has("currentEstimateMinor") && !spending.isNull("currentEstimateMinor"))
                        text.append("\n実行中の暫定見積: ").append(UsageCurrencyFormatter.formatMinor(
                            spending.optLong("currentEstimateMinor"), currency, java.util.Locale.getDefault()))
                            .append("（依頼入力上限＋受信済み出力UTF-8 byte÷3の概算。Provider確定meterではありません）");
                    else text.append("\n実行中のProvider使用額: 未報告");
                    text.append("\n予約上限: ").append(UsageCurrencyFormatter.formatMinor(
                        spending.optLong("reservedMaximumMinor", -1), currency, java.util.Locale.getDefault()));
                }
                text.append("\n請求照合: ").append(spending.optBoolean("invoiceVerified") ? "確認済み" : "未確認");
            }
            JSONObject price = execution.optJSONObject("price");
            if (price != null && "priced".equals(price.optString("status"))) {
                text.append("\n確定したProvider利用量の算定額: ").append(UsageCurrencyFormatter.formatMinor(
                    price.optLong("chargeMinor", -1), price.optString("currency", ""), java.util.Locale.getDefault()))
                    .append("（請求確定とは別）");
                appendRemoteAiUsageLines(text, price, price.optString("currency", ""));
            }
            String result = execution.optString("resultText", "");
            if (!result.isEmpty()) text.append("\n\n成果\n").append(result.length() > 4_000 ? result.substring(0, 4_000) + "…" : result);
            else if (!execution.optBoolean("saveResult")) text.append("\n成果は保存されていません。");
            return text.toString();
        }
        if ("agent-status".equals(kind)) {
            JSONObject delegation = root.optJSONObject("delegation");
            if (delegation == null) return root.toString(2);
            text.append("Agentのクラウド作業\nAgent: ").append(delegation.optString("targetAgentName", "不明"))
                .append("\n状態: ").append(delegation.optString("remoteState", delegation.optString("state", "不明")));
            String taskCurrency = delegation.optString("budgetCurrency", "");
            text.append("\nこのAgent依頼の上限: ").append(UsageCurrencyFormatter.formatMinor(
                delegation.optLong("budgetLimitMinor", -1), taskCurrency, java.util.Locale.getDefault()))
                .append("\n親job全体の上限: ").append(UsageCurrencyFormatter.formatMinor(
                    delegation.optLong("parentBudgetLimitMinor", -1), taskCurrency, java.util.Locale.getDefault()));
            JSONObject live = root.optJSONObject("liveUsageSnapshot");
            if (live != null) {
                String currency = live.optString("currency", "");
                long amount = live.optLong("cumulativeAmountMinor", -1);
                text.append("\n実行中の暫定使用額: ").append(UsageCurrencyFormatter.formatMinor(
                    amount, currency, java.util.Locale.getDefault()))
                    .append("（署名済みProvider報告、請求・最終確定前）")
                    .append("\n計測版: ").append(safeUsageLabel(live.optString("pricingVersion", "")))
                    .append(" / 連番: ").append(live.optLong("sequence", -1));
                appendProviderUsageLines(text, live.optJSONObject("snapshot"), currency, amount);
            } else if (!terminalA2AState(delegation.optString("state"))) {
                String currency = delegation.optString("budgetCurrency", "");
                long cap = delegation.optLong("budgetLimitMinor", -1);
                text.append("\n現在のProvider使用額: まだ報告されていません")
                    .append("\n許可上限: ").append(UsageCurrencyFormatter.formatMinor(
                        cap, currency, java.util.Locale.getDefault()))
                    .append("（現在額の報告ではありません）");
            }
            JSONObject receipt = root.optJSONObject("usageReceipt");
            if (receipt != null) {
                String currency = receipt.optString("currency", "");
                long amount = receipt.optLong("amountMinor", -1);
                text.append("\nProvider署名済み最終利用額: ").append(UsageCurrencyFormatter.formatMinor(
                    amount, currency, java.util.Locale.getDefault()))
                    .append("（プラットフォーム請求・支払確定とは別）")
                    .append("\n利用明細ID: ").append(safeUsageLabel(receipt.optString("providerReference", "")));
                appendProviderUsageLines(text, receipt.optJSONObject("receipt"), currency, amount);
            }
            JSONArray events = root.optJSONArray("events");
            if (events != null && events.length() > 0) {
                text.append("\n最近の進捗:");
                for (int i = 0; i < events.length() && i < 5; i++) {
                    JSONObject event = events.optJSONObject(i);
                    if (event == null) continue;
                    text.append("\n・").append(safeUsageLabel(event.optString("eventType", "update")))
                        .append(" — ").append(safeUsageLabel(event.optString("toState", "状態更新")));
                }
            }
            return text.toString();
        }
        if ("agent-result".equals(kind)) {
            JSONArray artifacts = root.optJSONArray("artifacts");
            if (artifacts == null || artifacts.length() == 0) return "保存された成果はまだありません。";
            text.append("保存されたAgent成果");
            for (int i = 0; i < artifacts.length() && i < 5; i++) {
                JSONObject artifact = artifacts.optJSONObject(i);
                if (artifact == null) continue;
                JSONObject document = artifact.optJSONObject("document");
                text.append("\n\n成果 ").append(i + 1).append("\n").append(
                    document == null ? artifact.toString(2) : document.toString(2));
            }
            return text.length() > 8_000 ? text.substring(0, 8_000) + "…" : text.toString();
        }
        return root.toString(2);
    }

    private static boolean terminalA2AState(String state) {
        return "remote_completed".equals(state) || "remote_failed".equals(state) ||
            "remote_rejected".equals(state) || "remote_cancelled".equals(state) ||
            "cancelled_before_dispatch".equals(state) || "expired".equals(state);
    }

    private static String safeUsageLabel(String value) {
        return value != null && value.matches("[A-Za-z0-9._:-]{1,64}") ? value : "確認不可";
    }

    private void appendRemoteAiUsageLines(StringBuilder text, JSONObject price, String currency) {
        JSONArray items = price.optJSONArray("items");
        if (items == null || items.length() < 1 || items.length() > 8 || !currency.matches("[A-Z]{3}")) {
            text.append("\n利用量内訳: 取得できません");
            return;
        }
        text.append("\nProvider利用量内訳:");
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || !item.optString("category", "").matches("[A-Za-z-]{1,32}")) {
                text.append("\n利用量内訳: データを検証できません");
                return;
            }
            long tokens = item.optLong("tokens", -1);
            long rate = item.optLong("rateMinorMicrosPerMillionTokens", -1);
            if (tokens < 0 || rate < 0) {
                text.append("\n利用量内訳: データを検証できません");
                return;
            }
            text.append("\n・").append(item.optString("category"))
                .append(" — ").append(tokens).append(" tokens — ")
                .append(UsageCurrencyFormatter.formatRatePerMillionTokens(rate, currency, java.util.Locale.getDefault()))
                .append(" / 100万 tokens");
        }
    }

    private void appendProviderUsageLines(StringBuilder text, JSONObject signedDocument,
            String currency, long expectedTotalMinor) {
        JSONArray lines = signedDocument == null ? null : signedDocument.optJSONArray("usage");
        if (lines == null || lines.length() < 1 || lines.length() > 32 ||
                !currency.matches("[A-Z]{3}") || expectedTotalMinor < 0) {
            text.append("\n利用量内訳: 取得できません");
            return;
        }
        long total = 0;
        for (int i = 0; i < lines.length(); i++) {
            JSONObject line = lines.optJSONObject(i);
            if (line == null || !line.optString("meter", "").matches("[A-Za-z0-9._:-]{1,64}") ||
                    !line.optString("unit", "").matches("[A-Za-z0-9._:-]{1,64}")) {
                text.append("\n利用量内訳: データを検証できません");
                return;
            }
            long quantity = line.optLong("quantity", -1), amount = line.optLong("amountMinor", -1);
            if (quantity < 0 || amount < 0 || total > Long.MAX_VALUE - amount) {
                text.append("\n利用量内訳: データを検証できません");
                return;
            }
            total += amount;
        }
        if (total != expectedTotalMinor) {
            text.append("\n利用量内訳: 合計が一致しないため表示しません");
            return;
        }
        text.append("\n利用量内訳:");
        for (int i = 0; i < lines.length(); i++) {
            JSONObject line = lines.optJSONObject(i);
            text.append("\n・").append(line.optString("meter"))
                .append(" — ").append(line.optLong("quantity")).append(' ')
                .append(line.optString("unit")).append(" — ")
                .append(UsageCurrencyFormatter.formatMinor(line.optLong("amountMinor"),
                    currency, java.util.Locale.getDefault()));
        }
    }

    private void prepareCloudLlmQuote() {
        final String prompt = cloudLlmPrompt.getText().toString();
        final String currency = cloudLlmCurrency.getText().toString().trim().toUpperCase(java.util.Locale.ROOT);
        final Long parsedCap = UsageCurrencyFormatter.parseMajorToMinor(cloudLlmBudget.getText().toString(), currency);
        if (parsedCap == null) {
            cloudLlmQuoteSummary.setText("上限額を通貨単位で入力してください。丸めが必要な端数は使えません。"); return;
        }
        final long capMinor = parsedCap;
        if (prompt.trim().isEmpty() || prompt.length() > 24_000 || capMinor < 1 || capMinor > 100_000_000L ||
                !currency.matches("[A-Z]{3}")) {
            cloudLlmQuoteSummary.setText("依頼内容、ISO通貨コード、上限額を確認してください。"); return;
        }
        final boolean saveResult = cloudLlmSaveResult.isChecked();
        cloudLlmQuoteSummary.setText("署名済み料金表を照合して見積を作成中…");
        worker.execute(() -> {
            try {
                String response = new ShellConnection(this).prepareCloudLlmQuote(
                    UUID.randomUUID().toString(), prompt, capMinor, currency, saveResult);
                JSONObject root = new JSONObject(response);
                JSONObject execution = root.optJSONObject("execution");
                if (execution == null) throw new IllegalStateException("QUOTE_UNAVAILABLE");
                JSONObject quote = execution.optJSONObject("quote");
                JSONObject ceiling = quote == null ? null : quote.optJSONObject("ceiling");
                if (ceiling == null) throw new IllegalStateException("QUOTE_UNAVAILABLE");
                StringBuilder summary = new StringBuilder();
                summary.append("見積上限: ").append(UsageCurrencyFormatter.formatMinor(
                        ceiling.optLong("maximumChargeMinor", -1), ceiling.optString("currency", "USD"), java.util.Locale.getDefault()))
                    .append("\n価格版: ").append(ceiling.optString("pricingVersion", "不明"))
                    .append("\nモデル: ").append(ceiling.optString("modelId", "不明"))
                    .append("\n入力上限: ").append(ceiling.optLong("inputTokenUpperBound", 0))
                    .append(" tokens / 出力上限: ").append(ceiling.optLong("outputTokenLimit", 0))
                    .append(" tokens\nこの依頼に許可する支出上限: ").append(UsageCurrencyFormatter.formatMinor(
                        quote.optLong("approvedCapMinor", capMinor), currency, java.util.Locale.getDefault()))
                    .append("\n見積の有効期限: ").append(quote.optLong("expiresAt", 0));
                JSONObject rateCard = execution.optJSONObject("rateCard");
                if (rateCard != null) {
                    summary.append("\n単価（各100万token当たり）:")
                        .append("\n入力 ").append(UsageCurrencyFormatter.formatRatePerMillionTokens(
                            rateCard.optLong("inputMinorMicrosPerMillionTokens", -1), currency, java.util.Locale.getDefault()))
                        .append(" / 出力 ").append(UsageCurrencyFormatter.formatRatePerMillionTokens(
                            rateCard.optLong("outputMinorMicrosPerMillionTokens", -1), currency, java.util.Locale.getDefault()));
                    if (rateCard.has("cachedInputMinorMicrosPerMillionTokens"))
                        summary.append(" / cache入力 ").append(UsageCurrencyFormatter.formatRatePerMillionTokens(
                            rateCard.optLong("cachedInputMinorMicrosPerMillionTokens", -1), currency, java.util.Locale.getDefault()));
                    if (rateCard.has("cacheWriteMinorMicrosPerMillionTokens"))
                        summary.append(" / cache書込 ").append(UsageCurrencyFormatter.formatRatePerMillionTokens(
                            rateCard.optLong("cacheWriteMinorMicrosPerMillionTokens", -1), currency, java.util.Locale.getDefault()));
                    summary.append("\n出典: ").append(rateCard.optString("sourceUrl", "不明"));
                }
                if (!root.optBoolean("executionAvailable"))
                    summary.append("\n実行状態: provider料金・請求受入前のため実行停止中。依頼本文はProviderへ送信されていません。");
                else
                    summary.append("\n見積を確認しました。実行には別途、上限額を明示して承認してください。");
                final String display = summary.toString();
                final String newQuoteId = execution.optString("id", "");
                final String newApprovalDigest = execution.optString("approvalDigest", "");
                final String newModel = ceiling.optString("modelId", "");
                final int newOutputLimit = ceiling.optInt("outputTokenLimit", 0);
                final boolean canExecute = root.optBoolean("executionAvailable");
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        cloudLlmQuoteId = newQuoteId;
                        cloudLlmApprovalDigest = newApprovalDigest;
                        cloudLlmQuotedPrompt = prompt;
                        cloudLlmQuotedModel = newModel;
                        cloudLlmQuotedOutputLimit = newOutputLimit;
                        cloudLlmQuotedCurrency = currency;
                        cloudLlmQuotedCapMinor = capMinor;
                        cloudLlmQuotedSaveResult = saveResult;
                        cloudLlmQuoteSummary.setText(display);
                        cloudLlmExecutionConsent.setChecked(false);
                        cloudLlmExecutionConsent.setVisibility(canExecute ? View.VISIBLE : View.GONE);
                        cloudLlmExecuteButton.setText("支出上限 " + UsageCurrencyFormatter.formatMinor(
                            capMinor, currency, java.util.Locale.getDefault()) + "を承認して実行");
                        cloudLlmExecuteButton.setVisibility(canExecute ? View.VISIBLE : View.GONE);
                        refreshCloudServiceHome();
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) cloudLlmQuoteSummary.setText(
                    "見積を作成できません。ログイン、利用権、署名済み料金表、通信状態を確認してください。実行・請求は行っていません。"); });
            }
        });
    }

    private void executeCloudLlmQuote() {
        String prompt = cloudLlmPrompt.getText().toString();
        String currency = cloudLlmCurrency.getText().toString().trim().toUpperCase(java.util.Locale.ROOT);
        Long parsedCap = UsageCurrencyFormatter.parseMajorToMinor(cloudLlmBudget.getText().toString(), currency);
        if (parsedCap == null) {
            cloudLlmQuoteSummary.setText("上限額を通貨単位で入力し直して見積を作り直してください。"); return;
        }
        long cap = parsedCap;
        if (!cloudLlmExecutionConsent.isChecked()) {
            cloudLlmQuoteSummary.setText("実行前に上限額を確認し、承認欄へチェックしてください。"); return;
        }
        if (cloudLlmQuoteId == null || cloudLlmQuotedPrompt == null || !prompt.equals(cloudLlmQuotedPrompt) ||
                !currency.equals(cloudLlmQuotedCurrency) || cap != cloudLlmQuotedCapMinor ||
                cloudLlmSaveResult.isChecked() != cloudLlmQuotedSaveResult) {
            cloudLlmQuoteSummary.setText("依頼内容または上限が見積後に変わりました。もう一度見積を作成してください。"); return;
        }
        cloudLlmExecuteButton.setEnabled(false);
        cloudLlmQuoteSummary.setText("承認済み上限を予約し、暗号化した依頼をクラウドqueueへ登録しています。");
        worker.execute(() -> {
            try {
                String response = new ShellConnection(this).executeCloudLlmQuote(prompt, cloudLlmQuoteId,
                    cloudLlmApprovalDigest, cloudLlmQuotedModel, cloudLlmQuotedOutputLimit);
                JSONObject result = new JSONObject(response);
                String rendered = result.toString(2);
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        cloudTaskDetailStatus.setText(rendered);
                        cloudLlmQuoteSummary.setText("クラウドが依頼を永続受付しました（実行期限は受付票に表示）。端末がオフラインでも期限内は処理を続け、再接続後は同じクラウド作業一覧から進捗・成果を確認できます。Provider利用量と実請求は別途照合が必要です。");
                        cloudLlmExecutionConsent.setChecked(false);
                        cloudLlmExecuteButton.setVisibility(View.GONE);
                        refreshCloudServiceHome();
                    }
                });
            } catch (Exception failure) {
                runOnUiThread(() -> {
                    if (!isDestroyed()) {
                        cloudLlmQuoteSummary.setText("応答を確認できません。二重送信せず、クラウド作業の状態を更新してください。利用量や請求が未確定の可能性があります。");
                        cloudLlmExecuteButton.setEnabled(true);
                        refreshCloudServiceHome();
                    }
                });
            }
        });
    }

    private static String yes(JSONObject object, String key) {
        return object != null && object.optBoolean(key) ? "接続" : "利用権なし";
    }

    private static String llmQueueLabel(String state) {
        switch (state) {
            case "awaiting_approval": return "承認待ち";
            case "approved_waiting_for_submission": return "送信待ち";
            case "queued": return "クラウドqueue受付済み";
            case "running_or_reconciling": return "クラウド実行または照合中";
            case "completed": return "完了";
            case "usage_or_result_reconciliation_required": return "利用額・成果の照合が必要";
            default: return "状態確認中";
        }
    }

    private void beginDeviceLink() {
        accountLinkStatus.setText("安全なRockstarアカウント連携を開始しています…");
        worker.execute(() -> {
            try {
                JSONObject status = new JSONObject(new ShellConnection(this).beginRockstarDeviceLink());
                runOnUiThread(() -> { if (!isDestroyed()) applyDeviceLinkStatus(status); });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) accountLinkStatus.setText(
                    "連携を開始できません。Brokerとサービス接続設定を確認してください。"); });
            }
        });
    }

    private void openDeviceLinkApproval() {
        String approval = deviceLinkApprovalUri;
        if (approval == null || approval.isEmpty()) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(approval))); }
        catch (Exception unavailable) { accountLinkStatus.setText("承認ページを開けません。URLを確認してください。"); }
    }

    private void pollDeviceLink() {
        deviceLinkHandler.removeCallbacks(deviceLinkPoll);
        String flowId = deviceLinkFlowId;
        if (!activityResumed || flowId == null) return;
        long delay = deviceLinkNextPollAt - System.currentTimeMillis();
        if (delay > 0) {
            deviceLinkHandler.postDelayed(deviceLinkPoll, Math.min(delay, 60_000));
            return;
        }
        worker.execute(() -> {
            try {
                JSONObject status = new JSONObject(new ShellConnection(this).pollRockstarDeviceLink(flowId));
                runOnUiThread(() -> { if (!isDestroyed()) applyDeviceLinkStatus(status); });
            } catch (Exception failure) {
                runOnUiThread(() -> { if (!isDestroyed()) accountLinkStatus.setText(
                    "承認状態を確認できません。通信を確認し、連携を再開してください。"); });
            }
        });
    }

    private void applyDeviceLinkStatus(JSONObject status) {
        if (accountLinkStatus == null || status == null) return;
        String state = status.optString("state", "blocked");
        if ("linked".equals(state)) {
            deviceLinkFlowId = null; deviceLinkApprovalUri = null;
            deviceLinkHandler.removeCallbacks(deviceLinkPoll);
            accountLinkCode.setVisibility(View.GONE);
            accountLinkApprovalButton.setVisibility(View.GONE);
            accountLinkCheckButton.setVisibility(View.GONE);
            accountLinkStatus.setText("端末にRockstarアカウントのセッションを保存済みです。サーバーでの失効確認は各API利用時に行います。\n有効期限: " +
                android.text.format.DateFormat.format("yyyy-MM-dd", status.optLong("expiresAt")));
            return;
        }
        if ("authorization_pending".equals(state) || "slow_down".equals(state)) {
            deviceLinkFlowId = status.optString("flowId", null);
            deviceLinkApprovalUri = status.optString("verificationUriComplete", null);
            deviceLinkNextPollAt = status.optLong("nextPollAt", System.currentTimeMillis());
            accountLinkCode.setText("承認コード: " + status.optString("userCode", ""));
            accountLinkCode.setVisibility(View.VISIBLE);
            accountLinkApprovalButton.setVisibility(View.VISIBLE);
            accountLinkCheckButton.setVisibility(View.VISIBLE);
            accountLinkStatus.setText("ブラウザーでこの端末名を確認して承認してください。承認後は自動で接続を確認します。");
            if (activityResumed) deviceLinkHandler.post(deviceLinkPoll);
            return;
        }
        deviceLinkFlowId = null; deviceLinkApprovalUri = null;
        deviceLinkHandler.removeCallbacks(deviceLinkPoll);
        accountLinkCode.setVisibility(View.GONE);
        accountLinkApprovalButton.setVisibility(View.GONE);
        accountLinkCheckButton.setVisibility(View.GONE);
        if ("not_configured".equals(state))
            accountLinkStatus.setText("Rockstarサービス接続先が未設定です。開発時はGradleのrockstarServiceOriginを指定します。");
        else if ("denied".equals(state)) accountLinkStatus.setText("連携は承認されませんでした。必要ならもう一度開始してください。");
        else if ("expired".equals(state)) accountLinkStatus.setText("承認コードの期限が切れました。もう一度開始してください。");
        else if ("not_linked".equals(state)) accountLinkStatus.setText("Rockstarアカウント未連携です。");
        else accountLinkStatus.setText("連携状態を確認できません。" + status.optString("code", ""));
    }

    private void applyDeviceCapabilities(JSONObject capabilities) {
        if (deviceCapabilityStatus == null) return;
        long now = SystemClock.elapsedRealtime();
        long observedAt = capabilities == null ? -1 : capabilities.optLong("observedAtElapsedMs", -1);
        long expiresAt = capabilities == null ? -1 : capabilities.optLong("expiresAtElapsedMs", -1);
        JSONObject profile = capabilities == null ? null : capabilities.optJSONObject("deviceProfile");
        JSONObject localInference = profile == null ? null : profile.optJSONObject("localInferenceObservation");
        if (capabilities == null || capabilities.optInt("protocolVersion", -1) != 3 ||
            !"local_observation".equals(capabilities.optString("scope")) ||
            profile == null || profile.optInt("version", -1) != 2 ||
            !"android_public_api".equals(profile.optString("source")) ||
            !"existing_os_client".equals(profile.optString("deliveryMode")) ||
            !oneOf(capabilities.optString("managedSubscriptionManagement"), "eligible", "not_eligible", "unsupported", "unknown") ||
            !oneOf(capabilities.optString("automaticProfileEnablement"), "eligible", "not_eligible", "unsupported", "unknown") ||
            !oneOf(capabilities.optString("organizationOwnedDevice"), "true", "false", "unknown") ||
            !validLocalInferenceObservation(localInference) ||
            observedAt < 0 || expiresAt <= now || expiresAt <= observedAt ||
            expiresAt - observedAt > 30_000L) {
            clearDeviceCapabilityExpiry();
            deviceCapabilityStatus.setText("端末能力: Brokerから新しい情報を取得できません。\n"
                + "eSIMプロファイル・プラン適合: 未確認。\nRockstarOS全体の端末適合: 未評価。");
            return;
        }
        String feature;
        switch (capabilities.optString("eUiccFeature")) {
            case "supported": feature = "AndroidがeSIM対応を報告"; break;
            case "unsupported": feature = "AndroidがeSIM非対応を報告"; break;
            default: feature = "eSIM対応を確認できません";
        }
        String management;
        switch (capabilities.optString("eUiccManagement")) {
            case "enabled": management = "eSIM管理は現在有効"; break;
            case "disabled": management = "eSIM対応端末ですが現在の管理は無効"; break;
            case "not_supported": management = "eSIM管理は非対応"; break;
            default: management = "eSIM管理状態は不明";
        }
        boolean mep = "supported".equals(capabilities.optString("multipleEnabledProfiles"));
        String multipleProfiles = mep ? "複数profile同時有効: Androidが対応を報告"
            : "複数profile同時有効: 未確認または非対応";
        String managedEsim = "eligible".equals(capabilities.optString("managedSubscriptionManagement"))
            ? "Android 15管理eSIM: このBrokerは管理者登録済み"
            : "Android 15管理eSIM: このBrokerの管理権限は未確認または対象外";
        String automaticEsim = "eligible".equals(capabilities.optString("automaticProfileEnablement"))
            ? "eSIM自動有効化API: 組織所有の管理端末条件を満たす（profile/plan適合は未確認）"
            : "eSIM自動有効化API: 条件未確認または対象外（OS確認が必要な場合があります）";
        JSONObject identity = profile.optJSONObject("reportedIdentity");
        JSONObject resources = profile.optJSONObject("resources");
        String model = identity == null ? "" : identity.optString("model", "");
        if (model.length() > 96) model = model.substring(0, 96);
        long totalMemory = resources == null ? -1 : resources.optLong("totalMemoryBytes", -1);
        long freeMemory = resources == null ? -1 : resources.optLong("availableMemoryBytes", -1);
        long freeStorage = resources == null ? -1 : resources.optLong("availableAppStorageBytes", -1);
        JSONObject hardwareFeatures = profile.optJSONObject("hardwareFeatures");
        String hardware = hardwareFeatures == null ? "未取得" : observedFeatures(hardwareFeatures);
        String memory = totalMemory > 0 && freeMemory >= 0 && freeMemory <= totalMemory
            ? formatGiB(freeMemory) + " / " + formatGiB(totalMemory) : "未取得";
        String storage = freeStorage >= 0 ? formatGiB(freeStorage) : "未取得";
        String localAi = localInferenceSummary(localInference);
        int apiLevel = profile.optInt("apiLevel", 0);
        deviceCapabilityStatus.setText("端末: " + (model.isEmpty() ? "機種名未取得" : model)
            + " / Android API " + (apiLevel > 0 ? apiLevel : "未取得") + "（OS申告値）"
            + "\nRAM空き/合計: " + memory + " / アプリ領域空き: " + storage
            + "\n観測feature: " + hardware
            + "\n端末内AI: " + localAi
            + "\n提供形態: 既存Android上のclient。native OS適合は未評価。"
            + "\n" + feature + "\n" + management + "\n" + multipleProfiles
            + "\n" + managedEsim + "\n" + automaticEsim
            + "\neSIMプロファイル・通信プラン適合: 未確認（回線識別子は読み取りません）。"
            + "\n端末内LLMとRockstarOS全体の適合: 未評価。"
            + "表示・ハードウェアfeatureはAndroid公開API/OSの申告で、機種受入や実機認証ではありません。");
        clearDeviceCapabilityExpiry();
        deviceCapabilityExpiresAt = expiresAt;
        deviceCapabilityExpiry = () -> {
            if (!isDestroyed() && SystemClock.elapsedRealtime() >= deviceCapabilityExpiresAt) {
                deviceCapabilityStatus.setText("端末能力の確認期限が切れました。再確認してください。\n"
                    + "eSIMプロファイル・プラン適合: 未確認。\nRockstarOS全体の端末適合: 未評価。");
                deviceCapabilityExpiry = null;
                deviceCapabilityExpiresAt = -1;
            }
        };
        mainHandler.postDelayed(deviceCapabilityExpiry, expiresAt - now);
    }

    private static String formatGiB(long bytes) {
        return String.format(java.util.Locale.ROOT, "%.1f GiB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    private static boolean oneOf(String value, String... allowed) {
        for (String candidate : allowed) if (candidate.equals(value)) return true;
        return false;
    }

    private static String observedFeatures(JSONObject features) {
        StringBuilder summary = new StringBuilder();
        String[][] labels = {
            {"input.touchscreen", "touch"}, {"input.hardware_keyboard", "keyboard"},
            {"audio.microphone", "mic"}, {"camera.any", "camera"},
            {"connectivity.wifi", "Wi-Fi"}, {"connectivity.cellular", "cellular"}
        };
        for (String[] label : labels) {
            if (summary.length() > 0) summary.append(" / ");
            summary.append(label[1]).append(":").append(features.optString(label[0], "unknown"));
        }
        return summary.toString();
    }

    private static boolean validLocalInferenceObservation(JSONObject observation) {
        if (observation == null || !"not_reported".equals(observation.optString("modelProfileIdentity"))) return false;
        String trust = observation.optString("trustBasis");
        String state = observation.optString("state");
        if ("unavailable".equals(trust)) return "unknown".equals(state)
            && observation.isNull("modelLoaded") && observation.isNull("runtime")
            && observation.optInt("apiVersion", -1) == 0;
        if (!"approved_package_signature_and_binder_api".equals(trust)
                || !"llama.rn".equals(observation.optString("runtime"))
                || observation.optInt("apiVersion", -1) != 2
                || !(observation.opt("modelLoaded") instanceof Boolean)) return false;
        return ("ready".equals(state) && observation.optBoolean("modelLoaded"))
            || ("no_model".equals(state) && !observation.optBoolean("modelLoaded"))
            || "loading".equals(state) || "busy".equals(state) || "error".equals(state);
    }

    private static String localInferenceSummary(JSONObject observation) {
        if (!validLocalInferenceObservation(observation)) return "未確認";
        if ("unavailable".equals(observation.optString("trustBasis"))) return "runtime未接続";
        switch (observation.optString("state")) {
            case "ready": return "署名確認済みruntimeがモデルを読込済み（profile適合は未評価）";
            case "no_model": return "runtime接続済み、モデル未読込";
            case "loading": return "モデル読込中";
            case "busy": return "runtime実行中";
            case "error": return "runtime error";
            default: return "未確認";
        }
    }

    private void clearDeviceCapabilityExpiry() {
        if (deviceCapabilityExpiry != null) mainHandler.removeCallbacks(deviceCapabilityExpiry);
        deviceCapabilityExpiry = null;
        deviceCapabilityExpiresAt = -1;
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
        if ("LOCAL_AI_NOT_READY".equals(code)) return "開始していません。署名確認済みruntimeに利用可能なモデルを読み込んでください。";
        if ("MODEL_PROFILE_NOT_ACTIVE".equals(code)) return "開始していません。このモデルの検証済み配布profileが有効になっていません。";
        if ("MODEL_PROFILE_RUNTIME_MISMATCH".equals(code)) return "開始していません。モデルprofileと端末内runtimeの版または署名が一致しません。";
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
        activityResumed = false;
        stopObservingCloudReconnect();
        deviceLinkHandler.removeCallbacks(deviceLinkPoll);
        cloudTaskHandler.removeCallbacks(cloudTaskRefresh);
        recoverySetupToken = null; restorePhraseForPicker = null;
        clearDeviceCapabilityExpiry();
        if (recoveryPhraseView != null) recoveryPhraseView.setText("");
        if (recoveryPhraseInput != null) recoveryPhraseInput.setText("");
        worker.shutdownNow(); super.onDestroy();
    }
    private interface Action { Object run(ShellConnection connection) throws Exception; }
}
