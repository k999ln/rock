# O3 — AI・Agent

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 交換可能なローカルAIが権限を持たずに計画し、Agentが許可済み手順だけを実行する。

**主担当:** ROCK / **評価対象:** 既存DecisionProvider/RouterとAPKの限定AI契約

## 触る場所・読む資料

- [lib/llm-providers.ts](../../lib/llm-providers.ts)
- [lib/jev-evaluation.ts](../../lib/jev-evaluation.ts)
- [app/api/llm/](../../app/api/llm)
- [android/](../../android)
- [docs/jev-local-qwen-decision-fabric-design.md](../../docs/jev-local-qwen-decision-fabric-design.md)
- [contracts/decision-provider.json](../../contracts/decision-provider.json)
- [docs/llm-evaluation-architecture.md](../../docs/llm-evaluation-architecture.md)
- [docs/workstreams/07-android-device-local-ai.md](../../docs/workstreams/07-android-device-local-ai.md)

## 次の作業

- **AI02**: モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 — 詳細: `npm run work -- AI02`

AI02: model ID、hash、runtime、license、能力をmanifestで固定する

## 守る条件・残課題

- model結果はauthorityではない
- Toolをmodelから直接呼ばない
- chain of thoughtを保存しない
- 未解決: model交換・限定記憶・full OS統合は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| AI02-01（子） | ModelProfileとRuntimeManifestのidentity・hash・互換条件を固定する | 未着手 / 共通基盤 | OS10 |
| AI02-02（子） | hash・license・容量・互換検査で非active model stagingを保護する | 未着手 / 共通基盤 | OS10 / AI02-01 |
| AI02-03（子） | 仕事へのmodel/runtime版固定と旧job再開判定を実装する | 未着手 / 共通基盤 | OS10 / AI02-01 |
| AI02-04（子） | Brokerによるatomic切替・health判定・crash rollbackを実装する | 未着手 / 共通基盤 | OS10 / AI02-02 / AI02-03 |
| AI02-05（子） | 承認済み評価環境で2 model候補の交換・旧job再開・失敗復旧を実測する | 未着手 / 共通基盤 | OS10 / AI02-04 |
| AI02-06（子） | 権限非昇格の回帰とAI02の全体完了条件を照合する | 未着手 / 共通基盤 | OS10 / AI02-05 |
| AI02（親） | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 未着手 / 共通基盤 | OS10 |
| AI03 | モデル非依存の限定記憶・project分離・根拠・削除契約を実装し、projection更新を受入 | 未着手 / 共通基盤 | OS10 |
| AI07 | JevのSky明示利用を設計し、DecisionProviderとRouter／Harnessへの統合を受け入れる | 進行中 / 共通基盤 | AI02 |
| OS08 | Local Action AssistantのKotlin・arm64 APKをnative buildし、artifact lockとSoong OS imageへ接続 | 進行中 / 共通基盤 | — |
| OS09 | 確定した対象端末でGGUF import・機内モード推論・変更確認・30分連続温度試験を完走 | 進行中 / 共通基盤 | OS08 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| AI01 | RQ48をAstraで詳細設計しSolの独立監査を反映（設計のみ、runtime完了ではない） | 完了記録あり / 共通基盤 | — |
| AI08 | Jev／TypeSafe・Local Qwen・Cloud LLMをcode主導で統合するDecision Fabric全体詳細設計と機械可読安全契約を固定 | 完了記録あり / 共通基盤 | — |
| SKY17 | Jev Ultrafastを権限制御されたbrowser agent候補としてSky catalogと全Tool設計へ追加 | 完了記録あり / 共通基盤 | — |
| SKY18 | Jev ecosystem 10 repositoryを判断・browser・PC・mobile・review・routing・PAPER市場・referenceへ分離して候補登録 | 完了記録あり / 共通基盤 | — |
| OS07 | Local Action Assistantの固定source・オフラインLLM契約・署名限定Binder client/server・APK staging gateを実装 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run llm:architecture:check
npm run android:architecture:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 2候補modelの交換、旧仕事再開、機内モード、変更確認、30分熱試験を実機で通す。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O3 AI・Agentの <task ID> を進める。workspaces/O3/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
