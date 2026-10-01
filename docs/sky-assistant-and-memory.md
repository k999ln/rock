# Sky Assistant / Sky Memory設計

最終更新: 2026-09-19

## 利用者に見せる一つの入口

Skyはアプリ一覧ではなく、仕事を受け付ける窓口にする。利用者は「Instagramの広告からDM受注まで進めて」のように依頼し、Skyが実行可能な役へ振り分ける。現在は次の12役を `lib/sky-routing.ts` の固定規則で選び、知らない依頼を勝手に実行しない。

```text
利用者の依頼
    │
    ▼
Sky受付 ── 判断できない ──> 12役から本人が選択
    │
    ├─ CSV自動化役 ──> CSV整形・検査・納品（Sky Cloud）
    ├─ 販売収益化役 ──> メルカリ収益スターター（ブラウザ）
    ├─ ブランド運営役 ──> Fashion Brand Ops（PC / MCP、38操作）
    ├─ 案件判断役 ──> ココナラ案件チェック（ブラウザ）
    ├─ 記事編集役 ──> 記事の無料版メーカー（ブラウザ）
    ├─ 出典整理役 ──> 出典整理ツール（ブラウザ）
    ├─ 納品確認役 ──> 納品記録の照合（接続したPC）
    ├─ 契約管理役 ──> Rockstar Ledger（接続したPC）
    ├─ 法務受付 ──> 公式案内・任意のOpenAI接続（ブラウザ）
    ├─ 特許出願担当 ──> draft・明示同意後のOpenAI接続（ブラウザ）
    └─ 品質評価役 ──> 明示同意後のJev評価（Sky Cloud）
```

現在の受付はLLMエージェントではなく、説明可能なキーワード振り分けである。ただしブランド運営役の内部では、目標からCampaign Autopilot、Sales Concierge、Production Cockpitを組み立てる。自由会話型の複数役plannerは未実装であり、LLMを追加する場合も、実行権限・送信先・料金の確定は決定的なPolicy Brokerとapproval gateへ残す。

## アプリを毎回入れない仕組み

ツール本体を利用者の端末へ全部インストールする必要はない。処理場所を次の3種類に分ける。

| 実行場所            | 向く処理                                 | 利用者の準備            |
| ------------------- | ---------------------------------------- | ----------------------- |
| Skyブラウザ         | テキスト変換、判断補助、軽い処理         | Skyへサインインするだけ |
| 接続したPC          | ローカルファイル、長い処理、端末固有機能 | Sky Connectorを一度接続 |
| 審査済みMCP / Cloud | 外部サービスのAPIや共有業務              | 提供元OAuthで一度同意   |

ローカルファイルやハードウェアに触れる処理は、ブラウザだけでは代替できない。逆にテキスト処理まで個別アプリに分けず、Sky内の役として提供すれば導入工数を減らせる。

## Sky Memory

Sky Memoryは、利用者が許可した仕事情報を次回の役へ渡す保存層である。iCloudのように「一度設定すれば複数の役で使える」体験を目標にするが、何でも共有する一つの巨大プロフィールにはしない。

```text
本人が保存・編集・削除
        │
        ▼
Sky Memory
  ├─ 基本プロフィール（表示名、言語、時間帯）
  ├─ 仕事プロフィール（職種、得意分野、定型文）
  ├─ 接続情報（provider ID、scope、期限。token本体は保管庫）
  └─ 成果物参照（所有者、保存場所、hash、保持期限）
        │ 仕事ごとに必要項目だけ
        ▼
役へ渡すContext Envelope
        │
        ▼
実行前に送信先・権限・料金を表示して本人確認
```

保存データは利用者ID、workspace、用途、許可された役、保持期限、revisionを持つ。各役には必要な項目だけを渡し、秘密鍵・password・生のOAuth tokenはD1へ保存しない。tokenはOS KeychainまたはCloudのsecret storeへ置き、Sky Memoryには参照子とscopeだけを持つ。利用者には閲覧、訂正、役ごとの共有停止、全削除、exportを提供する。

## 実装順

1. 現在: X型Timeline、Sky受付、12役への決定的な振り分け、送信または役ボタンから既存の実行画面を開く接続。ブランド運営役は41 MCP操作とapproval gateへ接続する。
2. 次: `sky_profiles`と`sky_context_grants`、プロフィール編集、roleごとの共有確認、削除・export。
3. 次: OAuth接続保管庫、MCP preflight、tool capabilityとContext Envelopeの照合。
4. 次: 会話履歴から複数役を組み立てるplanner。ただし外部送信・購入・公開・納品は本人確認を維持。

## 完了と呼ばない範囲

Sky Memoryの永続保存、Sky Cloud・提供者OAuth、自由会話型planner、複数役の自動連鎖はまだ実装していない。現在の画面で動くのは12役への決定的な入口、既存ブラウザツール、PC上のSky MCP ConnectorとFashion Brand Opsへの接続までである。job、履歴、設定の保存をcanonical Sky Memory実装済みと扱わない。Fashion Brand Opsの実Provider接続・実投稿・実請求には別途credentialと個別承認が必要になる。
