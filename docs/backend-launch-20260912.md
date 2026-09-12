# OSバックエンド最小ローンチ監査 — 2026-09-12

対象はGitHub `k999ln/rock` の `codex/rockstaros-launch-candidate-20260910`、開始SHAは
`0cc5415e4724199505e1f54942918b72eb88ccae`。5時間枠で扱う最小製品を、公開fixtureと
合成Walletだけを使うローカル/QEMU Developer Previewに限定する。実機、実資金、外部provider、
一般公開MCPはこの判定へ含めない。

## 重複監査

- Fashion Brand Opsは別タスクでSky表示と38操作を検証中。同じUIファイルを編集しない。
- Rockstar Ledgerは別branch/PRで進行中。個人SQLiteをこのbranchへコピーしない。
- Value/Spend RuntimeはPR #11でSIMULATION/PAPERまで実装済みだが未統合。LIVEは無効のまま維持する。
- 別worktree `codex/backend-launch-hardening-20260912` には競合未解消の変更があるため取り込まない。
- GitHubの開始SHAではWeb、native source、Android、署名fixture、transport fixture、phone source準備の
  6 workflowが成功済み。OS imageの新規build/bootや実機合格へ読み替えない。

## 優先順位

### P0 — 最小ローンチに必要

1. ローカルHubの起動、SIGTERMによる安全終了、同じ状態からの再起動。
2. session/Host/Origin境界、署名packageのinstall→明示enable→実行→receipt保存。
3. SQLiteの整合、再起動後のsession失効と完了receipt復元、不確実な実行の自動再送禁止。
4. 利用者データを返さないloopbackヘルスチェック。
5. rc2配布8資産の取得、hash/署名、fresh導入、起動、保存、復旧の同一候補確認。
6. 製品LICENSE/第三者NOTICE、production署名・失効手順、本人限定Sitesのログイン後確認。
7. 合格した同一treeをGitへ保存し、限定公開先で反映を確認する。

1〜4はこの変更で完了。5〜7は外部資産・所有者設定・公開先権限が必要なため未完了。

### P1 — 時間が残る場合

- 完成済みのSky/Fashion、Rockstar Ledger、Value/SpendをそれぞれのCI結果と競合解消後に統合する。
- Hubの運用ログを件数・状態だけで集約し、入力、session、秘密値を残さない。
- owner-only SitesのWebとローカルHubを同じ利用者フローで再確認する。

### P2 — ローンチ後または別承認

- Pixel/BlackBerryの実機OS build、flash、OTA、純正復旧。
- 実USB、一般外部MCP/OAuth、金融provider、ATM、実決済・実送金。
- Polymarket LIVE、外部市場注文、実残高、KYC/地域判定。
- 一般公開とmain merge。

## 実装した安全策

- `Hub.close()` が所有するrecipe workerを停止し、実行中/取消要求中の仕事をdurableな
  `interrupted`へ確定する。同じ冪等keyは中断receiptを返し、自動再実行しない。
- `HubServer.server_close()` が必ずHubの停止処理を通る。
- SIGTERMを通常の終了経路へ接続し、サービス管理下の停止をexit 0で完了する。
- `/api/health`は認証前に利用できるが、loopbackと正しいHostだけに限定し、利用者・仕事・残高を返さない。
  両SQLiteを読めない場合は理由を漏らさず503にする。

## 検証

- 対象unit: `tests.test_hub` と `tests.test_hub_server`、22件PASS。
- 実process: `npm run os:backend:launch`、PASS。
- 実process検証は、起動、生存確認、未認証拒否、署名package導入/許可/実行、SIGTERM、
  2つのSQLite integrity check、再起動、旧session拒否、receipt復元を一時データで完走した。
- 開始SHA `0cc5415` のGitHub workflow 6件はすべてsuccess。今回の差分を含む全体CIはcommit/push後に別判定する。

## 起動・監視・復旧

開発用Hubはnative packageをeditable installした環境で次のように起動する。

```sh
rock-hub --state .state/hub --registry systems/rock-star-os/examples/registry
```

生存確認は `GET http://127.0.0.1:8877/api/health`。停止はSIGTERMまたはCtrl-C。再起動は同じ
`--state`を指定する。状態directoryを削除しない。異常終了後も起動時に未完了jobは`interrupted`となり、
利用者が入力を確認して新しいkeyで再試行する。配布版全体のbackup/restore/削除は
`docs/preview-installation-ja.md`に従い、旧候補へ戻す場合も既存状態を先に保全する。

## 現在のローンチ判定

**BLOCKED_FOR_LAUNCH**。バックエンドのローカルP0は通ったが、このcheckoutにrc2の配布8資産がなく、
production署名、製品許諾、本人限定Sitesのログイン後操作、同一最終候補のfresh導入/復旧を今回のsourceで
再確認できない。最短経路は、既存private draft releaseの8資産へアクセスできる所有者アカウントを接続し、
既存rc2を改変せず検証すること。sourceを変更して新imageを作る場合はLinux buildとD0〜D6再受入が必要になる。
