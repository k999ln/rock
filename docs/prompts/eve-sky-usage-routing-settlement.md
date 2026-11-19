# Eve / Sky：業者共通の使用量・担当選択・作者収益の開発プロンプト

## 目的と依頼

利用者はGPUをまだ借りられない。既存のLLM/Agentを使い、好みと仕事内容に応じて担当を選び、どの業者でも使用量・費用・作者への売上配分を追跡できるようにする。独自Eve重みの学習は別段階。現在の「自分のSky」管理画面・Home発見・Eve接続の修正を維持し、その上へ統合する。

主担当は Wallet / Billing / Providers、ROCK。既存task BIL02 / AI02 / AI05 / SKY14 / SKY21を使う。ROCKは計量・予算・選定・明細・台帳連携、EXTERNALは真のProvider利用/請求/決済証拠、JOINTは照合/返金/復旧の受入、OWNERは料金/販売地域/分配契約/有料実行上限を確定する。実契約未確定でも独立したfixtureを進める。

## 読むものと開始条件

AGENTS.md指定の正本5ファイル、workstreams入口/責任分界、03-wallet-billing-providers、実行承認、design-implementation-alignment、phaseGates、docs/sky-billing.md#cross-provider-usage-observation、docs/llm-evaluation-architecture.md、data/llm-capabilities.jsonを読む。設計v1.1は承認済みで再承認待ちにしない。lib/workflow.ts、既存remote-ai/A2A/Marketplace/Wallet/settlementを再利用する。

共有dirty checkoutを切替・resetせず、既存の他担当変更を保持する。main由来の正本が作業branchに未反映なら、最初に引継ぎ入口と優先順位を同期する。文書保存、作業branch保存、main統合、公開を別記録にする。global nextPromptは他作業が使用中のため、この分野別プロンプトへ無断置換しない。

## 現状の証拠

lib/sky-usage-observation.tsが共通表示契約sky-usage-observation/1。lib/llm-providers.tsがOpenAI/Anthropic/Google/OpenAI互換/local-model/Ollama応答のカウンターを保持する。lib/remote-ai-text-http.tsは既存OpenAI保存結果の投影、app/api/sky/a2a-delegations/route.tsは既存owner-scoped署名検証済みreceiptの投影。components/sky-usage-details.tsxをworkbench/sky-chat-workspaceで利用する。sky-free-cloud-panelは未報告を0と表示しない。

使用量観測は請求・入金・作者支払いの証明ではない。cache/reasoning/totalの包含関係を保持する。Providerの未報告はnull。直接応答の表示は永続明細の完成ではない。Agent receiptは既存検証storeを前提にしており、新しい署名検証器を作った意味ではない。

証拠docs/evidence/sky-cross-provider-usage.json：集中43/43、表示契約6/6、type/lint/design/baseline、full verify exit0、work API1694 assertions、CSV113、assets206/missing0。これは保存された当時のソースのhost/fixture結果。現在のsourceSha256を照合し、並行変更があるファイルへ結果を転用しない。ブラウザ受入、公開反映、Git commit/main merge、GPU借用、有料Provider実行、作者送金はこの変更では未実施。

## 修正順・原因・合格条件

### U01 公開版への統合
原因：ローカルとSitesのソース/DB migration系列が異なる。最新Siteを取得し、現在進行中のSky管理修正を保持して必要差分だけ統合する。正しいprojectはappgprj_6abdfad4c5648191bcae957913bd02fa。古いv100/v105を現在と決めつけず、root hosting設定で誤配備しない。
合格：同一候補をbuild/verifyし、公開Eve/Skyでprovider/model/usage/未確定表示を実読戻し。新しい有料呼出は予算承認がある場合だけ。保存済み結果とfixtureで確認できる部分を先に進める。

### U02 永続明細と業者別料金
原因：直接LLMの観測表示は一時的で、多業者共通の承認済み実行/請求照合へ未接続。既存owner/account/job/run/receiptへ紐付け、versioned単価、通貨、meter、単位、適用時刻、料金出典を記録。既存予算予約・cap・実行状態・精算を拡張する。
合格：再読込で同じ明細、owner分離、同時実行cap、再送重複排除、再試行は独立attempt、cancel/timeout/結果不明の照合、欠落usageの保留。Provider応答だけで請求確定しない。生のprompt/鍵を計量ログへ保存しない。

### U03 作者への帰属・配分・支払い
原因：developerPaymentはcontract_not_bound。登録作者/権利/契約版/提供サービスを原始receiptへ結ぶ。既存Marketplace/settlement/Walletの配分・返金・支払状態を使い、新台帳を並立させない。
合格：同一usage一回配分、原価と作者売上の分離、返金/異議/失効/端数/通貨の整合、作者別アクセス制御、売上から原始明細への追跡。Sky作者売上手数料10%は既存対象契約にだけ適用。OSS公開モデルの利用で作者へ自動債務を作らず、権利者と報酬契約が未登録なら保留。実送金と計算fixtureを区別する。

### U04 好みと実績に基づく担当選択
原因：使用量観測だけでは仕事内容に適した選定にならない。既存model selector/AgentLibraryを調べ、本人の指定、Tool能力、データ持出条件、利用権、実行先可用性、予算を先に判定し、適格候補を品質/速度/費用の実測で順位付けする。権限外のfallbackやモデル提案によるBroker承認を許さない。
合格：同じ条件の選定を説明/再現でき、本人固定指定を保持。未知モデルは未評価として扱い、評価基準/版/件数を表示。モデル結果からTool成功へ昇格しない。task成功率、p50/p95時間、成功仕事当たり費用、予算超過件数、手動変更率を測り、改善前値のない優越性は宣言しない。

### U05 同一体験とフィードバック
Homeで発見、自分のSkyで登録/設定、Eveで依頼/承認/停止/結果/明細をつなぐ。本人には見積/上限/予約/確定額、作者には売上/控除/受取予定を表示。契約/入金照合が未完ならその段階を明示する。
合格：既存保存・revision競合を保持し、空/失敗/復帰/owner分離をUIで確認。学習同意とサービス利用同意を分け、訂正/役立ち度/仕事完了を同意範囲で収集。収集データを自動学習済みと呼ばない。GPUを契約せずに実装可能な範囲を完了する。

## 検証・終了時の引継ぎ

変更領域の集中試験から開始：node --experimental-strip-types --test tests/sky-usage-observation.test.mjs tests/llm-providers.test.mjs tests/remote-ai-text*.test.mjs tests/a2a-live-usage.test.mjs tests/a2a-usage-receipt.test.mjs tests/sky-presentation.test.mjs。既存billing/settlement/model-selector/AgentLibraryの対象試験を追加選択し、異常系を確認。npm run typecheck、npm run design:check、npm run baseline:check、npm run project:update、npm run project:check、最終に PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify。公開受入時は実UIも操作する。

project.md/status/README/設計indexと対応全体・Tool設計を同じ変更で同期する。証拠は候補SHAまたはファイルhash、環境、コマンド、件数、失敗、未実行、次の手順を残す。GitHub保存/CI、公開、Provider sandbox、実機、実資金を区別する。実行プロンプトの保存だけでruntimeの進捗を進めない。

RQ01〜RQ49を保持。RQ01〜15のOS/Tool/Wallet/ゲーム/作者SDK/ATM手数料0と矛盾させず、RQ12 QEMUとPixel本番OS受入を独立保持。RQ13実交換の未確定gate、RQ14作者権限と実資金権限の分離、RQ15外部実費と月額の分離を維持。一般ローンチ保留と既存Owner承認境界を維持する。

## 作成時GitHubメタデータ

取得日時 2026-10-22T05:01:22.217Z。npm run prompt:contextで最新取得・ref再照合成功。main `7304e449cd7938b098b0b1ce481a06501db8d795`、作業branch codex/esim-cloud-access `951d82d5a491a284aed4e0d4d280171d835d4b43`。本変更はdirty sourceでありそのbranch SHAへ含まれるとは限らない。

同一SHA checks:
```json
[
  {
    "sha": "7304e449cd7938b098b0b1ce481a06501db8d795",
    "state": "PASS",
    "total": 9,
    "allSuccessful": true,
    "checks": [
      {
        "name": "collect",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39723548634/job/119642247953"
      },
      {
        "name": "collect",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39680529151/job/119501524344"
      },
      {
        "name": "collect",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39641159003/job/119364743749"
      },
      {
        "name": "SPIDER / repair regressions",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39621130709/job/119294495055"
      },
      {
        "name": "SPIDER / production web security measurement",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39621130709/job/119294494666"
      },
      {
        "name": "SPIDER CodeQL (javascript-typescript)",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39621130879/job/119294494038"
      },
      {
        "name": "SPIDER CodeQL (python)",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39621130879/job/119294493234"
      },
      {
        "name": "SPIDER / secrets",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39621130434/job/119294490924"
      },
      {
        "name": "verify",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39621130400/job/119294490803"
      }
    ]
  },
  {
    "sha": "951d82d5a491a284aed4e0d4d280171d835d4b43",
    "state": "PASS",
    "total": 1,
    "allSuccessful": true,
    "checks": [
      {
        "name": "source-preparation",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/k999ln/rock/actions/runs/39052277743/job/117453101703"
      }
    ]
  }
]
```

関連統合PR #185/#184/#183/#182はmerged。open #130はmain-catchup、#100はrefactor、#103/#104/#108はcompute系、#105/#106/#110は品質/Sites系列で、本変更の統合証拠ではない。metadataのみで全branchの実装を読了したとは扱わない。最新context全量ログはGit外/private/tmp/eve-usage-prompt-context.log。

## 今回の文書変更後の検証結果

全体verifyはexit1。Node1239件中1237 pass、1 skip、1 cancelled。tests/sky-activation.test.mjsのactivation codes試験が10秒timeout。対象試験をlocalhost許可環境で再実行して4/4 pass。全体再合格・build完了とはしない。ログ/private/tmp/eve-usage-prompt-verify.log、/private/tmp/eve-usage-prompt-activation-recheck.log。前回の計量実装9ファイルのhashは証拠と一致。次の安定候補で全体verifyを再実行する。
