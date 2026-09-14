# OSバックエンド最小ローンチ監査 — 2026-09-12

対象はGitHub `k999ln/rock` の統合候補 `c7c284a2e43d807018f35c81ee95985d61fbacf0` を起点とする。
最小製品を、本人限定Sites、独立した収益精算Worker、公開fixtureと合成Walletだけを使う
Developer Previewに限定する。実機、実資金、外部provider、本番払出し、一般公開MCPはこの判定へ含めない。

## 重複監査

- Fashion Brand OpsのSky表示、38操作、ワンタップ接続は完成済みコミットだけを統合した。
- Rockstar Ledgerは別branch/PRで進行中。個人SQLiteをこのbranchへコピーしない。
- Value/Spend RuntimeはPR #11でSIMULATION/PAPERまで実装済みだが未統合。LIVEは無効のまま維持する。
- OS Hub lifecycleの完成済みコミットだけを取り込み、共有worktreeの途中差分は使わない。
- GitHubの開始SHAではWeb、native source、Android、署名fixture、transport fixture、phone source準備の
  6 workflowが成功済み。OS imageの新規build/bootや実機合格へ読み替えない。

## 優先順位

### P0 — 最小ローンチに必要

1. ローカルHubの起動、SIGTERMによる安全終了、同じ状態からの再起動。
2. session/Host/Origin境界、署名packageのinstall→明示enable→実行→receipt保存。
3. SQLiteの整合、再起動後のsession失効と完了receipt復元、不確実な実行の自動再送禁止。
4. 利用者データを返さないloopbackヘルスチェック。
5. Web本体とD1の認証・利用者分離・移行、Sky MCP、Fashion MCP、収益精算を同じtreeで全検証する。
6. 収益精算Workerを専用D1・署名secret・本人限定Sites originへ接続し、合成Receiptで縦断確認する。
7. 合格した同一treeをGitへ保存し、本人限定Sitesへ反映して旧versionへ戻せることを確認する。

1〜7をDeveloper Preview範囲で完了した。rc2配布資産、production署名、製品許諾は物理OS配布の別ゲート、
有償商品と販売・決済・払出しProviderは事業ローンチの別ゲートとして未完了を維持する。

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
- `npm run verify`: Web 122 tests、Fashion Brand Ops 15 tests、仕事API 143 assertions、型、lint、
  3系統D1移行、MCP package、Billing Worker dry-run、production buildに合格。
- 公開Billing Worker: `/health` 200。署名済み合成Receipt 888 centsを201で受け、Sky fee 888、
  payout `not_required`、同一Receipt再送200、status 200、不正Origin 403を確認した。実入金・実送金ではない。
- 実環境とロールバック情報は
  [owner validation evidence](evidence/launch/backend-owner-validation-20260912.json) に保存する。

## 起動・監視・復旧

開発用Hubはnative packageをeditable installした環境で次のように起動する。

```sh
rock-hub --state .state/hub --registry systems/rock-star-os/examples/registry
```

生存確認は `GET http://127.0.0.1:8877/api/health`。停止はSIGTERMまたはCtrl-C。再起動は同じ
`--state`を指定する。状態directoryを削除しない。異常終了後も起動時に未完了jobは`interrupted`となり、
利用者が入力を確認して新しいkeyで再試行する。配布版全体のbackup/restore/削除は
`docs/preview-installation-ja.md`に従い、旧候補へ戻す場合も既存状態を先に保全する。

収益精算Workerの生存確認は
`GET https://rockstar-sky-billing.mr-kirin999.workers.dev/health`。D1移行は
`npm run billing:migrate`、Worker反映は`npm run billing:deploy`を使う。secretはWranglerとSitesの
secret storeだけへ置き、Gitへ保存しない。Sitesは直前のversion 12を残しているため、問題時はその保存版を
再deployできる。D1のEarning Receipt台帳は追記型なので、障害時に削除や巻戻しを行わず取込を停止して照合する。

## 過去候補rc3-localの限定受入記録

2026-09-12にsource `9a8da90f64c8e6acedb17f163ee23a8ed17a35fc`から作成した
`1.0.0-preview.20260912-rc3-local`は、合成データと公開開発鍵を使うローカルQEMU Developer Previewの
範囲でfresh導入、署名toolのinstall/enable/run、画面内終了、非空backup/restore、復元後の履歴確認、
最終停止まで合格した。archive SHA-256は
`2bbb9b1e102e1a0829dae384678951c7bf4cd0d11edd1e31652284c80996a630`。

これは当時の固定sourceに対する履歴証拠であり、現在の統合branchや今後の候補へ合格を転用しない。
同一sourceのSites配備、full D0〜D6、production署名、製品license、実機、一般公開、実資金は未実施。
詳細なscope、hash、未合格条件は
`docs/evidence/launch/backend-rc3-local-20260912.json`を正本とする。

## 現在のローンチ判定

**READY_FOR_OWNER_VALIDATION**。OS Hub、Web/D1、Sky MCP、Wallet精算Workerの最小バックエンドは、
合成データと本人限定環境で起動・停止・再起動・保存・認証・失敗境界・反映を確認した。

ただし**事業としての一般ローンチ／実収益回収は未許可**。有償商品1件、販売・決済・払出しProviderの
sandbox credential、Provider署名済み入金event、返金・dispute・払出し失敗運用、所在地・主体・規約の確認が残る。
物理OS配布もrc2資産、production署名、製品許諾、実機受入が揃うまで別途BLOCKEDのまま。
