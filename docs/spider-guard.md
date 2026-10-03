# Spider Guard — RockstarOS本体の秘密・個人情報保護

更新日: 2026-10-02 / task: `SYS15` / 状態: `in_progress`

## 要求と現在地

利用者は、クモが秘密コード・個人情報のある場所を優先して守り、継続して監視する実機能を要求した。表示デモではなく、正本repository `k999ln/rock` の実処理へ接続する。画面のクモは実際の検査結果を表現するもので、描画や経過時間を保護実績として数えない。

利用者は常駐先として **RockstarOS本体** を選択した。既存Platform serviceのUID 1002で起動し、OS側の固定範囲を継続検査する。Platform MCP送信とRunnerControlのprepare／初回send claimにも検査を組み込む。Web AI／MCP Connectorの送信前検査は補助であり、OS本体への常駐を代替しない。

OSへの同梱、boot時起動、再起動監督、native画面の実データ表示までが実装範囲。現在は実装・検証中で、変更後の同一imageのboot、Pixel実機、24時間連続運転は未受入。過去のQEMU／Pixel試験を今回の常駐保護の成功に流用しない。

2026-10-02、利用者は追加の映像参照に沿ったnativeアニメーション改善を進めるよう明示した。細い発光脚、青い足先の輪、pink／cyanの小さな四角いcoreを、実際の検出位置への移動と重点表示へ取り込む。このアニメーションのLinux source検証は記録済み。さらに利用者はクモに「セキュリティーエージェント」の役割を明示し、実際の監視・検査・拒否・報告と役割表示を接続し、追加のsource検証を記録した。現在の表示先はnative security panelであり、OS全体のoverlayは未選択。以下の旧source検証は保存commit `a7cfca3a7fb78439ae9af8c6b832c02c2d9d70ae`に対応し、変更後のrendererの合格証拠へ流用しない。

## 自分のコードを貼って検査する

2026-10-02の追加指示により、利用者のコードを貼り付け、編集のたびに自動検査し、実際の候補をクモと一覧で示す機能を追加した。配布物はrepository外の`outputs/SPIDER.html`と簡単な説明`outputs/SPIDER-使い方.txt`。ブラウザで直接開けるoffline単一HTMLで、SDK、API key、登録、serverの起動は不要。

1. `SPIDER.html`を開き、コードを貼るか「ファイルを読み込む」で選ぶ。
2. 言語を選ぶ。既定では編集が止まって500 ms後に再検査する。「コードを検査」で手動検査もできる。
3. 指摘の行番号から該当箇所へ移動し、理由・修正案を確認する。「結果を保存」は本文を含まない検査metadataだけをJSONへ出力する。

入力上限はUTF-8の64 KiB／2,000行、結果は最大100件。秘密→個人情報→コード候補の順に優先し、件数は返した候補だけを数える。JavaScript／TypeScriptの字句パターン、Python、テキスト・設定を選べる。共通の秘密・個人情報候補に加え、コードでは動的コード実行、shellを介した実行、HTML挿入、TLS検証の無効化の4種類を静的に確認する。完全な構文・型・依存関係解析ではなく、補間式や未完了の構文、候補上限などの制限を結果へ示す。

検査はHTML内のWeb Workerで行い、CSPの`connect-src 'none'`で外部通信を禁止する。入力コードを実行・upload・永続保存せず、読み込んだ原fileも書き換えない。編集後は前の結果を古いものとして扱い、対応する最新結果だけを表示する。0件は安全保証ではなく、実行中programの監視・通信遮断・自動修正ではない。入力はページを閉じると失われる。

開発者はrepository rootから次で単一ファイルを再生成できる。保存先は任意のpathへ変更できる。

```sh
node scripts/build-spider-inspector.mjs --output ../SPIDER.html
```

生成元は`toolkits/spider-guard/inspector.html`、`detector.mjs`、`program-inspector.mjs`。生成HTMLを開くためのnpm installは不要。native側には別にowner限定の`security.inspectCode`を追加し、明示入力のsourceを検査して値を含まない指摘を返す。既存Platformの固定範囲監視、送信前拒否、権限・承認は維持する。この追加のbuild・Node試験とloopback HTTPのブラウザ動作、nativeのhost Python境界試験を記録した。native LinuxとOS起動の受入は未実行で、前版の合格を転用しない。

### OS側の明示入力API

`systems/rock-star-os/os/platform/code_inspector.py`をPlatformへ同梱する。owner UI UID 1000だけが、余分なfieldのない`{v:1, op:'security.inspectCode', source, language}`を送れる。`language`は`javascript`／`python`／`text`。戻り値は`{ok:true, result}`で、resultは`schemaVersion:1`、言語、状態、最大100件の指摘、分類別件数、`coverageLimited`、制限の説明を持つ。指摘はrule・分類・重大度・行範囲・固定文の理由と修正案で、本文・値・snippetを返さない。

Nativeも入力は64 KiB／2,000行に限定する。Pythonは最大20,000 AST nodeの限定解析、JavaScriptは字句検査、textは秘密・個人情報候補だけを検査する。ブラウザ版とnative版の解析方法は異なり、全結果の一致は保証しない。nativeも秘密→個人情報→コード候補の順で最大100件を返し、件数は返した候補だけを数える。100件を超える省略や解析不能は`coverageLimited`で示す。候補がある場合は不完全でも`needs_review`、候補なしで検査不能なら`incomplete`、空入力は`empty`、検出なしは`no_findings`とする。入力型・言語・field不正は`CODE_INSPECTION_INVALID_INPUT`、入力上限は`CODE_INSPECTION_TOO_LARGE`として拒否する。

このAPIは渡されたsourceだけを検査し、外部呼出し・コード実行・保存を行わない。既存guardの`inspections`／`blocked`／最新拒否を増やさず、コード内の危険候補を実際の送信拒否として数えない。sourceを変更して再要求することで新しい結果を得る。今回のhost境界試験は別記録とし、Linux上の同じrevisionの受入を残す。

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

### Nativeアニメーション改訂

利用者提供の[参照映像1](https://www.instagram.com/reel/DdhYiKdz-6t/)と[参照映像2](https://www.instagram.com/reel/DdmGyhRRQGi/)から、黒い背景上の細く発光する曲線の関節脚、青い足先の輪、pink／cyanの四角いcore、node graph内を動く表現を見た目の参照とする。追加の[参照投稿](https://www.instagram.com/p/Dd97sTPjEu6/?img_index=2)では文字・リンク上をクモが重点表示する見た目を参照する。投稿の実装技術は推定しない。参照動画自体を配布物へ同梱せず、既存の黒・銀・ice-blueのnative security panelへ実装する。

- 移動先と囲む行は取得した実findingに結び付け、秘密候補を重点的に示す。nodeや候補がない場合に架空の検出位置を補わない。
- 関節脚と足先の輪を動かし、選んだ実finding行へ近づいて囲む。見た目の動きから新しい権限、検出、送信拒否を発生させない。
- 短い拒否反応は、新たに観測した実`blocked` counterの増加にだけ対応する。初回取得の過去累計、同じ値の再描画、counterのresetを新たな拒否として再生しない。
- 接続、生存、鮮度の判定を維持し、stale／dead／error／missing／disconnectedでは移動と反応を停止する。最終受信した画像を現在も監視中と見せない。
- API、検出器、監視周期、UID、送信前の拒否契約はこの見た目の改訂では変更しない。rendererは値を含まない最大3件のmetadataだけを使い、描画からIPCや送信を起動しない。

受入は、新しいnative C build／renderer試験、複数時刻の画像比較、実findingへの移動・囲み、counter初期値／増加／同値／reset、非稼働各状態の停止、最大3件・秘密非表示・IPC非発生を対象とする。新規結果は検証記録の`nativeAnimationRevisions`へ別に追記し、旧source hash mapを上書きしない。

### Security Agentの役割

利用者の追加指示により、クモを実処理に接続されたSecurity Agentとして扱う。Platformが返す`security.agent`は`id: spider`、`role: security`、`scope: platform-data`、`duties: [watch_platform_data, inspect_outbound, deny_sensitive_outbound, report_health]`を持つ。監視workerの生存・鮮度と実findingから現在の状態を導き、実際の送信拒否から値を含まない`lastAction`を返す。native画面には役割、監視状態・検出候補・直近の送信拒否を示す。新たな検査・拒否を画面の動きから生成しない。

`watch`は固定Platform dataの継続検査、`inspect`は対応経路の送信前検査、`deny`は既存の拒否境界、`report`はowner認証付きmetadata表示に対応する。独立したLLM判断、外部送信、root権限、任意fileの修正・隔離、全OS通信の遮断を追加しない。guard停止、結果の古さ、制限はAgentの状態にも反映し、記録のない過去の行動を生成しない。固定の検査周期・file走査順は変えず、候補への注意を表示する。restartでcounter／eventと最新行動をresetする。

Agentの`state`は`starting`／`stopped`／`unavailable`をhealthに応じて優先する。健全なworkerでは実拒否後30秒間（monotonic計時）は`recent_block`、それ以外は直前走査の候補があれば`sensitive_data_detected`、なければ`watching`とする。`lastAction`は実拒否までnull、その後は`action: blocked`、allowlist化した`boundary`（`mcp.prepare`／`mcp.submit`／`remote.prepare`／`remote.send`／`unclassified`）、`count`（0〜2001）、分類`kinds`（secret／personalの重複なし・最大2）、有限のepoch秒`time`（0〜253402300799）だけを返す。上限による拒否は候補数不明としてcount 0／kinds空を許す。count 0には空のkinds、正のcountには既知の分類1〜2件を要求し、矛盾するmetadataは表示へ通さない。30秒経過や正常送信で最新行動を消さず、process再起動で失う。原文・path・値の追加保存はしない。

この役割追加ではPythonの実状態・最新拒否metadata、native表示、変更後sourceに対するPIN profileを改めて検証し、`nativeSecurityAgentRevisions`へ記録した。直前のアニメーション試験を合格証拠へ流用しない。OS全体へクモを重ねる表示範囲は未選択のため、現在のsecurity panel内で進める。

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
| `systems/rock-star-os/os/ui/security-ui.inc` | 認証済みsnapshotの実検出結果とAgentの役割を描画するnative UI |
| `systems/rock-star-os/os/ui/spider-motion.c` / `spider-motion.h` | 実finding metadataとcounterを入力にしたnative移動状態 |
| `scripts/review-native-pin-source.py` / `systems/rock-star-os/tests/test_ui_pin_source_profile.py` | Native source変更時のPIN描画再確認とsource profile整合検査 |
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

### コード検査ファイルの検証

起点`3598598e6310b75516aa0ff3f29808dafc76689f`上の未commit作業で、JS module 13件＋生成HTMLの実Worker 1件、計14/14が成功した。入力を実行せず、reportへ値を含めないこと、上限、秘密優先と省略を検査した。macOS hostのPython 3.14.7でnative検査9、owner境界統合13、実際の一時install 1、計23/23も成功。今回nativeのLinux検証は未実行で、CI側の確認を残す。過去のLinux guard試験を今回へ転用しない。

ブラウザ検証は生成HTMLそのものをloopback HTTPで配信して行った。初期空状態、sampleの自動検査（秘密1・個人情報1・code 2）、行移動、編集後の0候補への更新、古い結果のreport保存無効化、元の秘密値を含まないJSON downloadを確認した。この検証surfaceはfile URL非対応のため、file URLで開く受入を実施済みとはしない。最終生成物の再読込でもsampleの4件を確認し、`outputs/SPIDER-preview.jpg`で読みやすい配置を目視した。

HTML・使い方fileのhash、変更source 12件と短い試験logのdigestは[検証記録](evidence/spider-guard-source-validation.json)の`codeInspectorRevisions`へ追加した。過去の証拠は保持する。最終`npm run verify`は先行7check（signing公開fixture64件を含む）の成功後、以前から再現済みのbaseline visual期待値`check-product-baseline.mjs:1057`でexit 1となり、後続gateは未実行。project／database／designの個別整合とdiff checkは成功した。これはofflineコード検査の配布であり、実行中programのinterception、OS起動、Pixel、24時間運転の受入ではない。

### Security Agent役割の最終source検証

Ubuntu 24.04 Linux aarch64（Python 3.12.3、network none、UID／GID 1002）で検出器11、Platform統合12、lifecycle 3、計26/26試験が成功した。worker／file／実送信前拒否fixture、health優先、30秒のmonotonic期限、最新拒否metadataの上限・整合を含む。同じLinux条件のread-only sourceで通常`rock-ui`と`rock-ui-test`を`-Werror`でbuildし、全native UI suiteと役割・直近拒否・count 0上限拒否・非稼働停止の描画試験が成功した。

最終sourceに対してWallet 14枚、ATM 14枚、誤操作8件の拒否、PIN readiness 11/11、source profile 1/1も再実行して成功した。PIN確認はroot所有の使い捨てfixtureであり、一般UIDやOS imageの実行へ読み替えない。実際のmasked auth画像を目視したsource-only candidateと現在のprofile／source hashの一致を照合し、RGB・ROI・閾値・deadlineを変更していない。

Security Agent表示を含む最終frame 030を目視し、役割・直近の拒否が重ならず読めることを確認した。repository外の`outputs/spider-guard-motion.gif`は656×454、80枚／8秒／10fpsの最新合成fixtureであり、以前のアニメーションpreviewと同じpathを置き換える。実検出・OS bootの映像ではない。最終source 14 file、log／reportとpreviewのSHA-256を[機械可読記録](evidence/spider-guard-source-validation.json)の`nativeSecurityAgentRevisions`へ別保存した。検証時点は未commitで、同一SHAのGitHub CIやremote mainの成功は未確認。

最終`npm run verify`はproject／repository／version／schema／database／release／release:signing（公開fixture64件）まで成功し、従来から再現済みの`baseline:check` visual期待値（`scripts/check-product-baseline.mjs:1057`）でexit 1となった。後続gateは未実行。project／database／designの個別整合検査も成功した。変更のないWeb試験は今回再実行せず、旧129 Python／49 Nodeを新しい試験数へ加算しない。同一image boot、QEMU、Pixel、24時間運転は未受入で、`SYS15`は`in_progress`を維持する。

### アニメーション単体のsource検証（役割追加前の履歴）

起点は`a7cfca3a7fb78439ae9af8c6b832c02c2d9d70ae`、検証時点は未commit作業木。Ubuntu 24.04 Linux aarch64（Python 3.12.3、Pillow 10.2.0、network none、read-only source）でUID 1002の通常`rock-ui`と`rock-ui-test`を`-Werror`でbuildし、deterministic controllerと全native renderer suiteが成功した。不正型のhealth、counter境界、非稼働状態の停止も含む。

Test binaryのopt-in出力だけで80枚／8秒／10fpsの合成fixtureを生成し、frame 030の拒否反応と079の巡回を目視確認した。この段階の描画fixtureはpreview用であり、実際の検出やOS起動の証拠ではない。出力pathは上記の最終役割版で置き換えられている。

Native source変更に伴うPIN profileの古いhashは、実際のWallet／ATM描画を確認後にsource hashだけ更新した。RGB、ROI、閾値、deadlineは維持し、root所有の使い捨てLinux fixtureでWallet 14枚、ATM 14枚、誤操作8件の拒否、PIN readiness 11/11、source profile 1/1が成功した。GitHub CIの再実行やOS bootの記録ではない。

この段階の`npm run verify`はproject／repository／version／schema／database／release／release:signing（公開fixture64件）まで成功後、以前から再現済みの`baseline:check` visual期待値（`scripts/check-product-baseline.mjs:1057`）で停止した。後続gateは未実行。Webの変更・49 Node試験の再実行はなく、初期129 Python試験も今回の件数へ加算しない。

[機械可読記録](evidence/spider-guard-source-validation.json)の`nativeAnimationRevisions`にこの時点のsource hashと短いlogのdigestを保存した。その後に依頼されたSecurity Agentの役割・最新行動表示は別の`nativeSecurityAgentRevisions`へ検証結果を記録する。同一image boot、QEMU、Pixel、24時間運転の未受入は維持する。

### 初期実装のsource検証（保存版 a7cfca3）

以下は前回検証時点の履歴である。32のproduction／test source hashは保存commit `a7cfca3a7fb78439ae9af8c6b832c02c2d9d70ae`と全件一致した。改訂中のrendererの最新結果ではない。

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
