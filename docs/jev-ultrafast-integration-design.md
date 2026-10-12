# Jev UltrafastをRockstarOSへ入れるための詳細設計

- 版: 1.0 / 2026-09-18
- 状態: Skyの導入候補。設計とcatalog登録まで。source取得、依存導入、API key接続、Chrome操作、本番利用は未実施。

## 1. 何を加えるのか

[Jev Ultrafast](https://github.com/browser-use/jev-ultrafast)は、Webページから操作できる要素を番号付きの候補へ変え、AIが`CLICK`、`TYPE_TEXT`、`SELECT`、scroll、wait、done、blockedのいずれかを選ぶbrowser agentである。AIにCSS selector、座標、shell、任意JavaScriptを作らせない点と、`DONE`の前に結果を独立検証する考え方をRockstarOSへ取り込む。

RockstarOSではJevを「何でもできるbrowser」にはしない。Skyで選び、Zemaで依頼を確認し、本人PCの隔離browserで、一つの許可siteと一つの仕事だけを操作するTool候補にする。

```text
本人 ─ SkyでJevを選ぶ ─ Zemaで目的・site・禁止操作を確認
                              │
                              ▼
RockstarOS Browser Broker ─ 専用Chrome profile ─ Jev
       │                         │                 │
       ├─ origin／操作／入力検査 ├─ 普段のcookieなし └─ 一手を選ぶ
       ├─ 外部作用の直前承認     └─ 一仕事一tab
       └─ 結果の独立検証とreceipt
```

## 2. 利用者が最初から最後まで行うこと

1. Skyで`jev-ultrafast`を選ぶ。画面には候補、MIT、外部API費用、必要なPC環境、未接続を表示する。
2. Zemaへ「どのsiteで何を確認・準備したいか」を伝える。
3. RockstarOSが許可origin、読取範囲、入力してよい内容、禁止操作、費用上限を一覧にする。
4. 本人が専用Chrome profileを起動し、一仕事一tabで接続する。普段使いprofileは接続しない。
5. 最初は`observe`でページを読み、操作案だけを見る。必要なら`prepare`で入力直前まで進める。
6. clickや入力を行う`act`では、許可した操作だけを一手ずつ実行する。送信・投稿・予約・購入などは直前に最終内容を表示し、別承認を取る。
7. Jevが`DONE`を返しても完了にしない。Brokerが期待したページ状態、確認番号または保存済み内容を読み直す。
8. Zemaが完了、未完了、結果不明、本人対応待ちを表示する。本人は停止、接続解除、記録削除を選べる。

## 3. 各componentの責任と、持たせない権限

| component       | 責任                                                 | 持たせない権限                                        |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Sky             | Tool情報、版、license、費用、必要権限、接続先を表示  | browserを直接操作しない                               |
| Zema            | 目的、禁止事項、進捗、承認待ち、結果を人の言葉で示す | 会話だけで権限を増やさない                            |
| Browser Broker  | origin、操作、入力、tab、費用、timeoutを強制する     | 任意URL、任意script、任意fileを渡さない               |
| Jev adapter     | 閉じた操作schemaと構造化DOM状態をJevへ渡す           | credential、秘密、RockstarOS DBへ直接触れない         |
| Jev             | 許可された候補から一手を選び、対象を検証して実行する | policy変更、承認代行、完了確定をしない                |
| Result Verifier | goalごとの成功条件を独立に読み直す                   | 新しい操作を開始しない                                |
| 専用Chrome      | 許可originの一仕事一tabを表示する                    | 普段のprofile、password manager、支払情報を共有しない |

## 4. 入力、出力、識別子、版、上限

### 入力

- `jobId`、`attemptId`、`toolId=jev-ultrafast`、固定source版。
- `goal`: 一つの観測可能な完了条件。曖昧な「いい感じに全部やる」は拒否する。
- `allowedOrigins`: scheme、host、portを完全一致させる一覧。redirect先は再確認する。
- `mode`: `observe`、`prepare`、`act`のいずれか。
- `allowedOperations`: Jevが公開する有限操作の部分集合。
- `approvedInputFields`: fieldの意味、最大文字数、許可するdata分類。生のpassword、OTP、秘密鍵、決済番号は指定不可。
- `completionChecks`: URL、表示text、状態、確認番号など、goal別の独立検査。
- `maxSteps`、`deadline`、`maxApiCost`。初期候補値は20手、5分、利用者指定上限で、採用試験後に確定する。

### 出力

- 各手の`operation`、候補番号、origin、前後page digest、検証結果、時刻。
- `DONE`、`BLOCKED`、`FAILED`、`UNCERTAIN`、`CANCELLED`の終端状態。
- Result Verifierの判定と、外部siteが返した確認番号またはそのdigest。
- API費用が確認できる場合のprovider receipt。推定費用を実費にしない。

画面本文、cookie、local storage、入力値全体、screenshotを既定保存しない。入力内容の監査には分類名、長さ、salt付きdigestを用い、秘密そのものをreceiptへ残さない。

## 5. 状態と失敗

```text
candidate → inspected → connected → observing → prepared
                                         │          │
                                         └──────────┴→ awaiting_approval → acting
                                                                            │
                                  completed_verified ← verifying ← jev_done ┤
                                                                            ├→ blocked
                                                                            ├→ uncertain
                                                                            ├→ failed
                                                                            └→ cancelled
```

- Jevの`DONE`は`jev_done`であり、`completed_verified`ではない。
- pageが取得時から変わった、click対象が隠れた、originが変わった場合はその一手を実行せず再観測する。
- login、MFA、CAPTCHA、payment、個人情報、file upload／download、別tab、frame、canvas、shadow root、未対応widgetに入ったら停止する。
- deadline、手数上限、費用上限を一つでも超えたら停止する。
- 外部作用後に通信が切れた場合は再clickしない。Provider側をread-onlyで照会できるまで`UNCERTAIN`にする。

## 6. 保存、保持、削除、backup

- API keyはRockstarOS secret storeの参照名だけをadapterへ渡し、Sky、Zema、receipt、logへ保存しない。
- 仕事記録はowner別に、許可内容、操作種別、digest、検証結果だけを保存する。raw HTMLとscreenshotはdebugで本人が明示許可した場合だけ短期保存する。
- 初期保持案は操作receipt 30日、debug artifact 24時間。採用前にprivacy reviewで確定する。
- 本人削除後も、法令・紛争対応に必要な最小receiptを保持する場合は、対象、理由、期限を先に表示する。
- backup対象はpolicy、Tool版、receipt。cookie、browser profile、API key、raw pageはbackupしない。

## 7. offline、再送、重複、結果不明

- Jevはlive Webと外部APIを使うためofflineでは実行しない。offline時は計画と過去receiptの閲覧だけを許可する。
- 読取操作は再観測できる。外部作用は`operationKey`と承認digestを一手へ結び、同じkeyを二度実行しない。
- browser crash後は新しいattemptとして再接続し、最後の外部作用をProviderのread-only画面で確認してから続ける。
- 確認できないときは成功にも失敗にも寄せず`UNCERTAIN`を維持し、本人へ照会手順を示す。

## 8. 更新、互換、rollback、復旧

- Gitのbranch名ではなく、監査したcommit SHA、Python package版、`browser-harness`版、Chrome major、model provider／model ID、prompt／policy版を一組で固定する。
- update時はlicense、依存SBOM、operation schema、DOM index形式、API応答schema、Chrome互換を再検査する。
- 旧receiptは当時の版で読み出せるようにし、新版で意味を書き換えない。
- 回帰時は直前の合格版へrollbackする。専用profileは破棄して作り直せることを復旧条件にする。
- upstreamが未署名でも、RockstarOSへの配布packageはRockstarOSの審査・署名・失効対象にする。

## 9. 安全、privacy、security、外部承認

### 常に拒否するもの

- password、OTP、秘密鍵、recovery phrase、payment cardの自動入力。
- 任意JavaScript、shell、extension追加、browser設定変更、security警告の回避。
- 本人の普段使いChrome profileやpassword managerの流用。
- siteの利用規約やrobots、地域・年齢・資格制限の回避。
- CAPTCHA／MFAの自動突破、account作成、権限変更、本人確認の代行。

### 毎回、直前に別承認するもの

- form送信、投稿、message送信、予約確定、購入、契約、削除、公開、upload、download。
- 承認画面には相手、origin、操作、送る内容、数量、金額、取消可否を表示する。
- 本人承認は一操作、一内容、一期限だけに有効で、後続stepへ流用しない。

Web本文には悪意ある命令が含まれるものとして扱う。Web本文をOS命令、permission変更、secret取得、別origin移動の根拠にしない。

## 10. 合格条件と証拠

`candidate`から限定`ready`へ進める前に、次をすべて満たす。

1. source commit、MIT notice、依存lock、SBOM、脆弱性reviewを固定する。
2. upstreamのoffline testとlintをclean環境で通す。
3. Rock所有のtest siteでclick、入力、select、scroll、wait、done、blockedを正常・異常とも再現する。
4. stale page、隠れたtarget、redirect、別tab、login、MFA、CAPTCHA、payment、prompt injectionをfail closedで拒否する。
5. 専用profileから普段のcookie、history、password、payment、downloadへ到達できないことを確認する。
6. 外部作用の全fixtureで別承認、operation key、crash後照会、二重実行防止を確認する。
7. Jevが誤って`DONE`を返しても独立検証が失敗なら完了にしない。
8. 20件以上の代表仕事で成功率、誤操作率、P50／P95時間、API call数、費用、human介入を測る。一つのdemo結果を一般性能として表示しない。
9. 停止、接続解除、key失効、profile破棄、log削除、rollbackを実演する。
10. Sky→Zema→Browser Broker→Jev→Result Verifier→receiptを一本通しで確認する。

実siteへの外部作用、第三者account、購入、投稿、予約を使った試験は、所有者とsiteの許可を別に得るまで行わない。

## 11. 未決定事項、決定者、決め方

| 未決定                        | 決定者                             | 決定に必要な試験                              |
| ----------------------------- | ---------------------------------- | --------------------------------------------- |
| 採用commitと更新頻度          | Tool maintainer＋security reviewer | dependency／regression監査                    |
| TypeSafe／text model provider | owner＋privacy／cost reviewer      | data location、保持、費用、品質比較           |
| 20手・5分・保持期間の確定値   | product owner＋operator            | 代表仕事benchmarkとincident演習               |
| 最初に許可するorigin          | product owner＋site owner          | 規約確認、owned test、external-write review   |
| MCP adapter schema            | Platform／Sky担当                  | compatibility、cancel、uncertain、receipt試験 |
| screenshot debugの要否        | privacy reviewer                   | screenshotなしでの調査可能性比較              |

## 12. 現在地

- できた: upstreamの公開情報、license、実行条件、操作モデル、制限を確認し、Sky catalogと全設計台帳へ`candidate`として登録した。
- まだ: source pin、clone、依存導入、API契約、Browser Broker／MCP adapter、専用profile、試験site、security review、実行、release署名。
- 表示規則: 「追加済み」は候補の設計・catalog登録を指す。「インストール済み」「使える」「高速」「安全」は受入証拠が揃うまで表示しない。
