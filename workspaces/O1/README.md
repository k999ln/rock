# O1 — 権限・Security

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 本人だけが許可した操作を実行し、全変更を監査・失効できるようにする。

**主担当:** ROCK / **評価対象:** Webの認証・拒否契約と署名fixture

## 触る場所・読む資料

- [lib/request-auth.ts](../../lib/request-auth.ts)
- [docs/spider-guard.md](../../docs/spider-guard.md)
- [services/operator-dock/](../../services/operator-dock)
- [systems/rock-star-os/](../../systems/rock-star-os)
- [docs/security-incident-response.md](../../docs/security-incident-response.md)
- [data/device-emergency-access-policy.json](../../data/device-emergency-access-policy.json)
- [docs/workstreams/04-security-identity-compliance.md](../../docs/workstreams/04-security-identity-compliance.md)

## 次の作業

- **SYS13**: 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 — 詳細: `npm run work -- SYS13`

SYS13: OS11、RLS02、LCH03の依存と既存証拠を同一候補ごとに照合する

## 守る条件・残課題

- default deny
- 秘密値を仕事本文へ保存しない
- 外部作用は実行直前承認
- 緊急accessも端末側で制限する
- 未解決: Pixel全OS・正式鍵・侵入/復旧受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| SYS13-01（子） | 緊急accessの既存APK証拠とfull OS不足を同一候補ごとに分ける | 未着手 / 共通基盤 | OS11 / RLS02 |
| SYS13-02（子） | hardware credential登録・失効・再登録の契約と公開設定を検査する | 未着手 / 共通基盤 | OS11 / RLS02 / SYS13-01 |
| SYS13-03（子） | Android serviceの限定command・期限・replay拒否・監査を実装検証する | 未着手 / 共通基盤 | OS11 / RLS02 / SYS13-01 / SYS13-02 |
| SYS13-04（子） | 候補imageのprivapp・SELinux分離と緊急復旧導線を受入表へ固定する | 未着手 / 共通基盤 | OS11 / RLS02 / SYS13-02 / SYS13-03 |
| SYS13-05（子） | 承認済みPixel候補で不正操作・失効・隔離の侵入試験を行う | 未着手 / 共通基盤 | OS11 / RLS02 / SYS13-04 |
| SYS13-06（子） | 同一Pixel候補で切断・再起動・失効後の復旧を検証しSYS13全条件を照合する | 未着手 / 共通基盤 | OS11 / RLS02 / SYS13-05 |
| SYS13（親） | 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 | 進行中 / 共通基盤 | OS11 / RLS02 |
| LCH03 | production署名・保護環境・失効運用 | 進行中 / 共通基盤 | — |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| SYS02 | 通知・保存保護・診断共有・安全な初期化と公開審査gateを設定へ実装 | 完了記録あり / 共通基盤 | — |
| SYS05 | 候補準備・法務承認・保護署名・本人署名の64拒否境界試験を全体verifyへ統合 | 完了記録あり / 共通基盤 | — |
| SYS06 | Android物理端末とマイナンバー連携を独立監査し、証拠なしの互換・GMS・販売・個人番号有効化を拒否 | 完了記録あり / 共通基盤 | — |
| SYS07 | Web/PWAのHTTP防御を正本化し、Worker・static asset両経路の実responseを検査 | 完了記録あり / 共通基盤 | — |
| SYS12 | 運営1名で開始できる緊急保護・限定保守accessの脅威モデルと端末側制御契約を固定 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run baseline:check
npm run design:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: Pixel実機で侵入、失効、再起動、production署名、rollbackを同一候補で受け入れる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O1 権限・Securityの <task ID> を進める。workspaces/O1/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
