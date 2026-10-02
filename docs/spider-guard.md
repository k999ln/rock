# Spider Guard — RockstarOS本体の秘密・個人情報保護

更新日: 2026-10-02 / task: `SYS15` / 状態: `in_progress`

## 要求と現在地

利用者は、クモが秘密コード・個人情報のある場所を優先して守り、継続して監視する実機能を要求した。表示デモではなく、正本repository `k999ln/rock` の実処理へ接続する。画面のクモは実際の検査結果を表現するもので、描画や経過時間を保護実績として数えない。

利用者は常駐先として **RockstarOS本体** を選択した。既存Platform serviceのUID 1002で起動し、OS側の固定範囲を継続検査する。Platform MCP送信とRunnerControlのprepare／初回send claimにも検査を組み込む。Web AI／MCP Connectorの送信前検査は補助であり、OS本体への常駐を代替しない。

OSへの同梱、boot時起動、再起動監督、native画面の実データ表示までが実装範囲。現在は実装・検証中で、変更後の同一imageのboot、Pixel実機、24時間連続運転は未受入。過去のQEMU／Pixel試験を今回の常駐保護の成功に流用しない。

## 責任と範囲

| 項目 | 内容 |
| --- | --- |
| 主担当 | Security / Identity / Compliance — `ROCK` |
| `rockDeliverable` | Platform内の検出器と固定範囲監視、MCP／RunnerControlの送信前拒否、認証付き状態API、native画面、同梱・boot監督・回帰検証 |
| `externalDependency` | 検出に外部Providerは不要。実Provider、OS imageのbuild／boot環境、Pixel機種固有の署名・導入は独立した受入 |
| `ownerAction` | 常駐先はRockstarOS本体に確定。実機導入は既存の機種・署名・復旧gateに従う。権限拡大や全filesystem走査は許可へ読み替えない |
| `acceptanceEvidence` | 境界ごとの拒否と外部呼出し0回、状態API認証、値の非表示、固定範囲・更新反映、同一imageのboot／再起動／障害復旧・継続運転 |
| `currentStage` | `ROCK_READY` に向けた実装・検証中。`ROCK_READY` 自体の達成は未判定 |

既存 `SYS02` の保存・診断保護を前提に、`SYS15` として独立管理する。`SYS13` のOperator Dock、端末命令・hardware credential・緊急管理権限を流用しない。RQ01〜RQ49、Pixel/QEMUの受入、公開・署名・実資金gateは変更しない。

## OS詳細設計

| 必須項目 | 契約 |
| --- | --- |
| 目的・利用者 | RockstarOS利用者の秘密と個人情報の候補を見つけ、対応する外部送信を実行前に拒否する。秘密情報を重点表示する |
| 利用体験 | OS起動→Platform内の監視開始→固定範囲を検査→本人native画面で最終検査・分類・失敗を確認。送信要求は監視周期とは独立に直前検査を受ける |
| 責任・禁止権限 | Platform UID 1002で実行。root化、任意host path、Wallet／他UIDの専用保存域の読取、Operator Dockの私的本文参照を追加しない |
| 入出力・ID・版・上限 | 固定rootはPlatformのstate（OSでは`/data/platform`）。要求本文でrootを選ばせない。周期は既定30秒。対象は下記allowlistの平文application data。認証済みowner UI（UID 1000）だけに`{v:1, op:'security.status'}`で値を含まない結果を返し、通常snapshotには概要を含める |
| 状態・失敗 | `starting`／`scanning`／`watching`／`error`／`stopped`を区別し、`workerAlive`・`fresh`、`coverageLimited`とskip件数を返す。起動未完了・古い結果を稼働成功や0件へ変換しない。送信の検査失敗は拒否する |
| 保存・保持・削除・backup | 原本を書換え・削除せず、検出値・原文を状態API、log、診断backupへ複製しない。結果はmemory内で最大300件、eventは最新30件。restartでcounter／eventはresetし、ファイルを再検査する。guard自身のdisk保存・telemetry・network送信はない |
| Offline・再試行・重複・不明 | 検出は端末内で実行する。MCP prepare／submitはconsentを除く送信内容を、RunnerControl prepareと初回durable send claimはtext・manifest・recipe・key・endpoint metadataを検査する。署名・承認digest・transport credentialは既存の暗号検証に委ね、本文判定で置換しない。送信済みの回復はmetadataによるstatus／cancelの既存契約を保ち、不明な処理を自動再送しない |
| 更新・互換・復旧 | `sensitive_guard.py`をPlatform packageへ含め、既存boot入口から起動する。監督は同じ非root UIDを維持し、停止した監視を稼働表示しない。同一imageで再起動・異常終了・復旧を検証し、問題時は既存の署名・rollback手順へ戻す |
| 安全・privacy・承認 | 既存owner認証、capability、外部送信承認を維持する。検出0件を承認へ昇格させず、拒否時に検出値をエラー文へ戻さない。クモの演出を止めても送信検査を無効にしない |
| 受入環境・証拠 | host合成fixture、Linux UID/IPC、同一image QEMU boot、Pixel実機、24時間継続運転を別記録とする。最後の3項目は現時点未受入 |
| 未決定と決め方 | 固定した範囲・上限での負荷、検査遅延、復旧時間はROCKが同一imageの資源／障害試験で測る。Pixel/AOSP側の配置はnative pathの単純コピーではなく既存Core契約と機種gateで判定する。24時間達成は稼働記録と停止・再開の証拠で判断する |

平文検査allowlistは`.json`、`.txt`、`.md`、`.csv`、`.env`、`.env.*`。SQLite、その他の拡張子、binary／NUL／不正UTF-8、symlink、hardlink、所有者の異なるfileは対象にしない。directory descriptorを基準に`O_NOFOLLOW`で探索する。1 fileは1,024,000 bytes／256,000 decoded characters、1 passは16 MiB／5,000 entries／深さ20、1 textは2,000候補を上限とし、上限到達を完全検査としない。

公開するfindingは`id`、相対`path`、`line`、`kind`、`label`、`severity`に限定し、path内の検出可能な個人情報も伏せる。件数は全検出数、一覧は最大300件とし、`findingsTruncated`で省略を示す。`inspections`と`blocked`は当該processの実検査・実拒否counterであり、起動前からの累計や攻撃を防いだ件数とは表示しない。

通常の認証済みsnapshotの`security`には状態、最終検査時刻、周期、検査file数、候補総数・秘密・個人情報、実拒否・検査counter、制限・省略のflagと先頭3件を含める。`workerAlive`は実Threadの生存と停止要求から、`fresh`はmonotonic時刻で最後の成功からの経過が`max(3 × interval, 90秒)`以内かつworkerが生存していることから計算する。欠落・不正型はfalseとして扱う。native `security-ui.inc`は接続・生存・鮮度が揃った実データだけを稼働表示し、架空の候補・件数を生成しない。

Platformの起動は`supervisor.py`を経由し、子processの異常終了後は1秒から最大30秒へ待機を増やして再起動する。60秒を超えて稼働した後は最短待機へ戻す。UIDは既存Platformの1002を維持し、shellや追加権限は与えない。Linux `PDEATHSIG`で監督process喪失時に子を終了させ、subreaperとして孤児になった子孫を引き取る。停止時と子leaderのcrash後には同じprocess groupへTERM、4秒以内に終了しなければKILLし、子孫をreapしてから再起動する。Platformのbind／serve失敗時もworkerを終了する。これは子process終了の回復であり、hangの検知、監督process自身の再起動、電源OFF・suspend中の検査、24時間可用性の証明ではない。

### 接続先と同梱入口

以下は実装・照合対象のpathであり、記載だけをbuild／boot成功としない。

| 場所 | 役割 |
| --- | --- |
| `systems/rock-star-os/os/platform/sensitive_guard.py` | 端末内検出・固定範囲監視・値を含まない状態 |
| `systems/rock-star-os/os/platform/supervisor.py` | 同じUIDでのPlatform子process監督・停止・再起動 |
| `systems/rock-star-os/os/platform/service.py` | Platformと同時起動、認証済み`security.status`、MCP prepare／submit境界 |
| `systems/rock-star-os/os/platform/runner_control.py` | prepare保存前と初回send claim前の検査、既存の不明結果回復 |
| `systems/rock-star-os/os/platform/install-target.sh` | `/usr/lib/rock-platform`への同梱と起動補助の配置 |
| `systems/rock-star-os/os/buildroot/package/rock-platform/rock-platform.mk` | BuildrootのPlatform package入口 |
| `systems/rock-star-os/os/buildroot/board/rock-virt/overlay/etc/init.d/S50rockplatform` | Platform UIDでのOS boot／stop、起動確認と監督の接続 |
| `systems/rock-star-os/os/ui/security-ui.inc` | 認証済みsnapshotの実検出結果を描画するnative UI |
| `toolkits/spider-guard/` | Web／Connector用の共通検出。OS本体の常駐とは別 |

## 共通の実装契約

- 検出器は秘密情報と個人情報の候補を区別し、秘密情報を優先する。ルールの対象、上限、誤検出・見逃しを明示し、検出0件を安全保証へ変換しない。
- OS監視はPlatformに固定した読取範囲だけを対象にする。原本を自動削除・書換えしない。画面・記録には件数、分類、必要な位置情報、検査時刻と失敗状態を返し、検出値や原文を含めない。
- Web AIの対象はLLM本文生成、法務、特許、Jevの既存送信経路。MCPの対象は今回接続するConnector境界。実際の外部呼出しより前に検査し、拒否対象は外部呼出しをせずに戻す。未接続の経路、任意アプリ、OS全体の通信を保護済みと表示しない。
- Webの既存本人認証、same-origin、利用者別保存、rate limit、外部送信同意を維持する。検出器の判断を本人承認やTool実行権限へ昇格させない。
- 検査不能、入力上限、読取失敗、接続切れは結果へ反映する。必要な検査が終わらない送信を「検査済み」として通さない。
- 状態画面は取得した実データから件数・対象・最終検査時刻を表示する。未取得・停止・失敗を0件や稼働中として扱わない。クモの演出停止と監視プロセス停止を区別する。
- 継続監視はプロセスが稼働している間の対応範囲に限る。再起動後の起動、sleep中の扱い、service監視、障害復旧まで確認する前に「24時間保護」を宣言しない。

## 検証と引継ぎ

2026-10-02、ColimaのDebian bookworm Linux container（Python 3.13、`--network none`、UID／GID 1002）でnative回帰125/125、supervisor 3/3、install 1/1、計129 Python試験が成功した。skipなし、`ResourceWarning`をerrorとして実行。file／Thread／境界拒否、Platformの終了cleanup、crash時の再起動と孤児process groupのkill／reapを含む。native Cの`rock-ui`／`rock-ui-test`は`-Werror`でbuildし、既存UI suiteが成功した。Spider描画fixtureも成功し、稼働時の移動、stale／dead／error／missing／disconnected時の停止、最大3件の表示、描画からのIPC非発生を確認した。active／staleのnative描画は目視で読めることを確認した。sourceと試験fileのSHA-256は機械可読記録に固定した。

Web／MCP境界のNode試験49/49、typecheck、lint:product、MCP配布物一致も成功した。[機械可読の検証記録](evidence/spider-guard-source-validation.json)に対象と再現commandを記録する。対象はbase HEAD `b3e2676abd8ae2a0b3f78f48483e067b429d9bc8`上の未commit作業木で、同一SHAのCI・remote main反映の証拠ではない。

全体`npm test`は455件中444成功・11失敗。変更前HEADでもvisual baselineの同じエラーとREADMEの2つの期待文言欠落を確認した。D1試験もHEADの必要42fileだけを隔離して再実行し、9件中2成功・7失敗（37表に対して32表を期待する6子試験と親）を再現した。11失敗は変更前からのものと確認したが、全体合格とはしない。最終`npm run verify`はproject／repository／version／schema／database／release／release:signing（公開fixture64件）まで成功し、`baseline:check`の既存visual期待値（`scripts/check-product-baseline.mjs:1057`）で停止した。これはHEADで再現した同じエラーである。後続gateをこの実行で成功したものとは扱わない。

Linux containerでのUID実行・同梱検査は、RockstarOS imageのboot、QEMU、Pixel実機、24時間運転の代用ではない。これらは未受入であり`SYS15`は`in_progress`を維持する。

```sh
PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os:systems/rock-star-os/tests python3 -B -W error::ResourceWarning -m unittest test_os_security_guard_integration test_os_runner_control test_os_platform test_sensitive_guard test_mcp_hub_gateway test_mcp_device_client test_compatibility_admission test_os_registry_control test_os_purchaser_health test_platform_service_lifecycle -v
# 125/125 PASS (Linux container, UID/GID 1002, network none)
PYTHONPATH=systems/rock-star-os/tests python3 -B -W error::ResourceWarning -m unittest test_platform_supervisor -v
# 3/3 PASS
PYTHONPATH=systems/rock-star-os/tests python3 -B -W error::ResourceWarning -m unittest test_os_platform_install -v
# 1/1 PASS
```

受入対象は、検出と非検出の境界、秘密を含む送信の拒否、拒否時の外部呼出し0回、正常入力の既存動作、入力上限、利用者分離、原文非表示、初回走査とファイル更新、停止・再起動、読取失敗の表示である。合成fixtureの試験と実Provider・端末の受入を分ける。

Web側の共通検証は `npm run typecheck`、`npm run lint:product`、対象試験、`npm run project:check`。OS設計同期は `npm run design:check`。統合前に `npm run verify` と対象native試験を実行し、既存失敗と本変更の失敗を分ける。OSの同梱・boot・再起動・障害復旧・24時間継続運転はそれぞれ証拠を追加するまで未受入とする。

関連: [Security workstream](workstreams/04-security-identity-compliance.md) / [製品基準](product-baseline.md) / [責任分界](workstreams/00-responsibility-boundaries.md)
