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
6. 製品LICENSE/第三者NOTICE、production署名・失効手順。
7. 合格した同一treeをGitへ保存し、限定公開先で反映を確認する。

1〜4はこの変更で完了。本人限定Sitesの既存v12はログイン後の読み出しまで確認済みだが、
sourceは`1763deb56990bc7dc380c72a5b6043cb089c21a0`であり、このバックエンド変更
`d66c67440700a2c7234472d80b80c27633039fe2`はまだ含まない。5〜7は同一treeで未完了。

### P1 — 時間が残る場合

- 完成済みのSky/Fashion、Rockstar Ledger、Value/SpendをそれぞれのCI結果と競合解消後に統合する。
- Hubの運用ログを件数・状態だけで集約し、入力、session、秘密値を残さない。
- owner-only SitesのWebとローカルHubを、統合後の同一source系列で再確認する。

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

## GitHubと実環境の追加確認

- OSバックエンド変更はbranch `codex/os-backend-launch-20260912` の
  `d66c67440700a2c7234472d80b80c27633039fe2`としてGitHubへpush済み。
- PR #14でWeb `verify`、native partitions 5件、native `source-tests`の全7 checkがPASS。
- 本人限定Sitesはversion 12、source `1763deb56990bc7dc380c72a5b6043cb089c21a0`、
  deployment `succeeded`、access mode `custom` / current user `owner`。
- 実ブラウザで`/chat`が最近の処理まで、`/settings`がtool controls・過去30日の利用記録まで
  読み込みを完了し、consoleのerror/warnは0件。初期化直後の未認証GETは401で安全に失敗し、
  認証成立後の本人データ読み出しは成功した。
- v12はこのOSバックエンドcommitの反映証拠ではない。統合担当がv12以降のsourceへ取り込み、
  新しいversionを配信してから同一treeの実環境合格に更新する。

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

**BLOCKED_FOR_GENERAL_LAUNCH**。バックエンドのローカルP0と本人限定Sites v12の既存フローは通ったが、
両者はまだ同一sourceではない。このcheckoutにrc2の配布8資産もなく、production署名、製品許諾、
同一最終候補のfresh導入/復旧を再確認できない。最短経路は、`d66c674`をv12以降のsourceへ統合して
本人限定で再配信し、並行して既存private draft releaseの8資産を所有者アカウントで改変せず検証すること。
sourceを変更して新imageを作る場合はLinux buildとD0〜D6再受入が必要になる。
