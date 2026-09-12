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

1〜5は完了。7はOS変更をGitHubへ保存し、統合担当のowner-only Sites v16を実環境で確認した。
6は一般配布条件として未完了であり、今回の限定Developer Preview判定には含めない。

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
- QEMU Previewの起動では、表示portとVM所有権の確認が通ってから任意のGame authorityを起動する。
  表示競合でOS起動が拒否された場合、新しいGame writerを残さない。

## 検証

- 対象unit: `tests.test_hub` と `tests.test_hub_server`、22件PASS。
- 実process: `npm run os:backend:launch`、PASS。
- 実process検証は、起動、生存確認、未認証拒否、署名package導入/許可/実行、SIGTERM、
  2つのSQLite integrity check、再起動、旧session拒否、receipt復元を一時データで完走した。
- QEMU Preview lifecycle対象51件がPASS。OS起動失敗時にGame writerを開始しない回帰試験を含む。
- 最終`npm run verify`はWeb 107件、Fashion Brand Ops 15件、型・lint・production build、
  API 143 assertionsを含めてPASS。
- 開始SHA `0cc5415` のGitHub workflow 6件はすべてsuccess。今回の差分を含む全体CIはcommit/push後に別判定する。

## rc2配布物とfresh host確認

- private draft release `1.0.0-preview.20260911-rc2` の8資産を取得し、GitHub上のsize/SHA256と
  ダウンロード済みbytesが全件一致した。
- `candidate-index.json`が宣言する7資産と、約1 GBのarchive内716 memberを、path・mode・size・SHA256まで
  extractionなしで照合し `PASS 7 716 NOT_CLEARED CANDIDATE`。
- 公開開発鍵のfingerprint `06e3…fa9`でcandidate manifestを検証し、source/host tools
  `b7d819cd291b653d165aa124f25a52b9898bfb2e`との結合を確認した。production署名ではない。
- macOS arm64 / Lima 2.2.0 / 72 GiB空きの隔離directoryへfresh installは成功。Debian 13.6、
  QEMU 10.0.13、image preflight、VM identityはPASSした。
- 初回`start --no-open`は、別の旧preview検証環境が固定viewer port `8900`を所有していたため、
  OS開始前に安全に拒否された。旧previewを画面内の正規電源操作で正常終了し、所有権を検証した
  viewerだけを停止した後、同じ未改変rc2を再実行した。
- rc2の実起動、ブラウザ上のARM64 OS画面、画面内の正常終了、Game writer停止を確認した。
- OS A/B/dataと独立Wallet/Game/Cを19 files・1,074,543,884 bytesとして保存し、OS manifest
  `0131ce…5ce`、authority manifest `b9c10e…07c0`へ結合した。host exportは約1.0 GB・20 files。
- 同じ所有VMの新端末`recovered`へ復元し、元端末を保持・retireしたまま、全3 disk hash、
  filesystem check、Wallet/Game authorityのwriter epoch更新を検証した。復元端末の起動と正常終了もPASS。
- 空状態の復旧だけで終わらせず、復元端末で署名済み`提案下書き（簡潔）` v1.1.0をインストールし、
  入力テキスト/結果表示、端末内処理、送信先なし、無料を画面で確認して利用を許可した。組み込みの
  合成サンプルを実行し、`external_submission: false` / `revenue_verified: false`の結果と完了履歴1件を確認した。
- 非空状態をもう一度OS A/B/data + Wallet/Game/Cの完全backupへ復元し、新端末`launch-restored-2`で
  インストール済み1件、完了履歴1件、同じ結果を画面で確認した。復元前後とも画面内電源操作で終了し、
  QMPの`guest: true` SHUTDOWNを確認した。最終状態はOS停止、Game writer停止。
- rc2は初回拒否前に任意Game sandboxを開始していた。今回作成したsandbox/VMは正常停止して残存を解消し、
  今後の候補ではOS/display preflight成功後にGameを開始するよう修正・回帰試験した。

## GitHubと実環境の追加確認

- OSバックエンド変更はbranch `codex/os-backend-launch-20260912` とPR #14へ保存した。
  runtime最終変更`1e3d71c`を含む`daef7b2`で、Web `verify`、native partitions 4件、native support、
  source-tests、release signing fixtureの全8 checkがPASSした。以後の変更は監査記録のみ。
- 統合担当branch `codex/os-backend-launch-prod-integrated-20260912` は
  `4b3d85aaa613f223519a70f0b973a6befa3f80e4`でremote一致・clean。OS起動順修正とSites認証修正を含む。
- 本人限定Sitesはversion 16、source `8047d120415689a6880dc7c6a513874ea335a33a`、
  publish deployment `succeeded`、environment revision 2、access mode `custom`、current user `owner`、
  external visitor 0。一般公開への変更はしていない。
- 実ブラウザで`/chat`が役割・最近の処理・入力欄まで、`/settings`が4 tool controls・過去30日の利用記録まで、
  `/fund`が6プランと実収益/送金未接続表示まで読み込みを完了した。`/chat`から旧hashのfund静的chunkへの
  GET 1件が404になったが、`/fund`直アクセスは現行bundleで正常表示した。P0阻害ではなくP1で監視する。

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

**LAUNCHABLE_OWNER_PRIVATE_DEVELOPER_PREVIEW / BLOCKED_FOR_GENERAL_LAUNCH**。
owner-only Sites v16と、公開開発鍵・合成データだけを使うQEMU Developer Previewは利用可能。
ローカルbackendの起動/認証/署名package実行/安全終了/再起動、rc2のfresh install、実UI処理、正常終了、
非空完全backup/restore、復元後起動と保存終了まで通った。ただしrc2は今回のbackend/Game起動順修正を含まない
既存候補であり、Sites sourceも別の配備repo SHAである。production署名、製品LICENSE/第三者許諾、
同一最終sourceからの新候補buildとD0〜D6再受入、実機、一般公開、実資金は未完了のため、これらへ拡大しない。
