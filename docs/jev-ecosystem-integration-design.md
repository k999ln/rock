# Jev ecosystemをRockstarOSへ入れるための全体詳細設計

版: 1.0 / 2026-09-18  
状態: 10 repositoryを調査し、Skyの導入候補へ登録。source取得、依存導入、API接続、model download、browser／Mac／Android操作、LIVE取引は未実施。

## 1. 今回入れるもの

利用者が指定したURLは`jev-review`の重複を除くと10件である。すでに登録済みの`jev-ultrafast`を維持し、残る9件を追加する。

| Tool ID                   | 役割                                 | RockstarOSでの置き場所      | 既定effect                  |
| ------------------------- | ------------------------------------ | --------------------------- | --------------------------- |
| `jev-ultrafast`           | 構造化DOMからbrowser操作を選ぶ       | Browser Broker              | remote-read。外部作用は停止 |
| `openjev`                 | 公開modelでtyped decisionを採点      | Local AI／Decision Provider | local-pure                  |
| `jevlike`                 | 小型option-scoring modelの学習・評価 | AI Lab                      | local-pure                  |
| `jev-trader`              | order bookから売買方向を選ぶ実験     | Markets sandbox             | PAPERのみ                   |
| `awesome-jev-by-typesafe` | pattern・use case・starter code集    | Design Library              | reference-only              |
| `typesafe-computer-use`   | OCRとJevによるMac画面操作            | PC Action Broker            | observeのみから開始         |
| `jev-review`              | Git差分／codebaseの段階review        | Developer Tool              | local-read＋明示したAPI送信 |
| `jev-router`              | Codex／Claude Codeのmodel振分け      | Model Router                | routing-only                |
| `jev-browser`             | 既存browser tool内の連続操作loop     | Browser Broker              | remote-read。外部作用は停止 |
| `mobile-jev`              | Mobilerun経由のAndroid操作           | Device Action Broker        | 隔離試験端末のみ            |

これらを一つの巨大な万能agentにはしない。判断、操作、review、routing、研究、金融を別Tool ID、別権限、別receiptとして扱う。

## 2. 全体構造

```text
Skyで候補を選ぶ
       │
       ▼
Zemaが目的・入力・実行先・費用・禁止操作を確認
       │
       ▼
RockstarOS Policy Broker
  ├─ Decision Provider ─ openjev / Jev API / jevlike
  ├─ Browser Broker  ─── jev-ultrafast / jev-browser
  ├─ PC Action Broker ── typesafe-computer-use
  ├─ Device Broker ───── mobile-jev
  ├─ Developer Broker ── jev-review / jev-router
  ├─ Markets Sandbox ─── jev-trader（PAPER）
  └─ Design Library ──── awesome-jev-by-typesafe（実行しない）
       │
       ▼
独立検証 → artifact／receipt → 本人review
```

Jev系modelが返す確率は権限ではない。`0.99`でも送信、購入、予約、取引、削除、公開、mergeを許可しない。RockstarOSのpolicy、本人承認、結果検証を別componentとして残す。

## 3. 利用者の共通体験

1. Skyで候補を開き、作者、source、license、実行場所、外部API、端末権限、費用、現在の未接続状態を見る。
2. Zemaへ一つのgoalを渡す。Zemaは入力、対象scope、禁止操作、成功条件を閉じた形へ直す。
3. Brokerが実行場所を隔離し、source版、model版、API、origin／path／app、step数、時間、費用上限を固定する。
4. `observe`またはoffline fixtureから始め、操作案とconfidenceだけを確認する。
5. 許可された有限操作だけを実行する。外部作用へ入る前に内容を固定した一回承認を取る。
6. Tool自身の`done`とは別に、Result Verifierが画面、file、test、provider状態を読み直す。
7. Zemaが`verified`、`blocked`、`uncertain`、`failed`、`cancelled`を表示し、本人が記録削除、接続解除、rollbackを選ぶ。

## 4. 共通入力・出力契約

### 入力

- `jobId`、`attemptId`、`toolId`、Tool source commit、adapter version。
- `goal`と、機械的に確認できる`completionChecks`。
- 許可する`scope`: repository path、origin、application、device ID、market fixture等。
- `mode`: `observe`、`prepare`、`act`。金融は`paper`だけ。
- `allowedOperations`、`deniedDataClasses`、`maxSteps`、`deadline`、`maxCost`。
- model provider、model ID／revision、prompt／question hash、confidence threshold。

### 出力

- 選択肢、選択結果、確率、threshold判定。長い秘密入力のraw値は残さない。
- 実行した有限operation、対象ID、前後state digest、時刻、費用。
- artifactとResult Verifier判定。Tool自己申告と独立検証を分ける。
- 失敗理由、停止位置、外部作用の有無、結果不明時の照会先。

任意shell、任意JavaScript、任意URL、root path、秘密鍵、password、OTP、recovery phraseを入力schemaにしない。

## 5. 共通状態と失敗

```text
candidate → inspected → installed_disabled → connected → observing
                                                        ├→ prepared
                                                        ├→ blocked
                                                        └→ awaiting_approval → acting
                                                                               │
                                  completed_verified ← verifying ← tool_done ──┤
                                                                               ├→ uncertain
                                                                               ├→ failed
                                                                               └→ cancelled
```

- `installed_disabled`はpackageがあるだけで、実行権限はない。
- confidence不足、選択肢外、scope外、secret検出、費用超過、page／screen変化、別app／origin移動で停止する。
- 外部作用後の通信断では再実行しない。照会できなければ`uncertain`を維持する。
- browser、Mac、Androidの緊急停止はmodelやTool processを通さずBrokerが実行する。

## 6. 保存、privacy、削除、backup

- API key、CLI login token、browser cookie、device credential、private keyはRockstarOS secret storeまたは各公式clientに残し、Toolへ値を表示しない。
- 既定保存はTool／model版、scope、選択肢、結果、確率、operation、state digest、検証結果、費用receipt。
- screenshot、OCR全文、DOM全文、source本文、Git差分、Android traceは既定保存しない。debug時は本人同意、対象、保持期限を表示する。
- 初期保持案はreceipt 30日、debug artifact 24時間。Tool別privacy reviewで確定する。
- backupにはpolicyとreceiptだけを含め、API key、profile、cookie、raw screen、private sourceを含めない。

## 7. 更新、互換、rollback

- repositoryごとにcommit SHA、license、lockfile、SBOM、runtime、model revision、API schemaを固定する。
- branchの最新を自動実行しない。更新は差分review、offline test、owned fixture、権限差分を通す。
- Tool IDを共有してもadapterとreceipt schemaはToolごとに分ける。
- regression時は直前の合格版へ戻し、profile／virtual environment／試験端末を破棄して再作成できることを確認する。
- community repositoryの性能値、価格、model alias、外部service仕様はRockstarOSで再測定・再確認する。

## 8. Tool別詳細

### `jev-ultrafast`

Webの可視controlをindex化し、有限operationと対象を選ぶ。専用Chrome profile、一仕事一tab、origin allowlist、秘密入力拒否、外部作用直前承認、独立完了検証を必須とする。完全な契約は[Jev Ultrafast詳細設計](jev-ultrafast-integration-design.md)。

### `openjev`

- 入力: state、runtime-defined criteria、typed options。
- 出力: option probability、timing、model revision、prompt hash。
- 実行: Python 3.10以上、CUDA、4B BF16を保持できる隔離GPU環境。
- 禁止: TypeSafe Jevとの同一性主張、未確認model license、判断からの直接Tool実行。
- 合格: pinned modelでowned fixtureを再現し、calibration、OOM、長文、同率、unknown option、CPU fallbackを測る。

### `jevlike`

- 入力: textまたはimage feature、可変個のoption、dataset／checkpoint。
- 出力: option probability、training／evaluation metric、trace。
- 実行: AI Labだけ。業務本番のdecision providerにはしない。
- 禁止: demoのDoom／chess成績を一般能力へ換算、出所不明dataset、gameからOS権限へ直結。
- 合格: dataset provenance、train／validation分離、再現seed、calibration、adversarial option、model cardを揃える。

### `jev-trader`

- 入力: 固定時点のorder book replay、PAPER position、手数料・slippage仮定。
- 出力: buy／sell／hold確率、仮想quote、仮想fill、PAPER PnL、risk event。
- 実行: `PRIVATE_KEY`なし、dry-run、network order送信をBrokerで拒否する。
- 禁止: LIVE、実Wallet、実注文、秘密鍵、収益実績への計上、損失回復の自動増額。
- 合格: replay決定性、look-aheadなし、通信断、重複block、late decision、費用込み成績、損失上限を確認する。LIVE化は別製品・法務・金融releaseであり、このcandidate採用には含めない。

### `awesome-jev-by-typesafe`

- 入力: 文書snapshot、example URL、記載source。
- 出力: RockstarOSのpattern候補、根拠link、採用／不採用理由。
- 実行: しない。Design Libraryのreferenceとして読むだけ。
- 禁止: community記述を公式仕様・現在価格・安全保証にする、掲載codeを一括実行する。
- 合格: 各採用patternが一次source、license、権限、費用、試験へ辿れる。

### `typesafe-computer-use`

- 入力: 許可appのscreen observation、goal、有限action候補。
- 出力: action、target、confidence、前後screen digest、verification。
- 実行: 専用macOS account、許可app、emergency stop、observe modeから開始。
- 禁止: 普段使いaccount、password manager、system settings、Terminal、credential／決済入力、無承認の外部送信。
- 合格: coordinate drift、window移動、OCR誤読、popup、secret field、低confidence、停止、crashをowned appで拒否できる。

### `jev-review`

- 入力: 明示repositoryとcommitのdiff、またはallowlisted path。秘密fileを除外する。
- 出力: file／line、具体的根拠、severity、confidence、test gapを持つreport。
- 実行: loopback dashboard。sourceを外部へ送る範囲を事前表示する。
- 禁止: filesystem全走査、自動修正、commit、push、merge、issue投稿、指摘なしを品質保証にする。
- 合格: synthetic bug／clean diff、秘密除外、binary／large file、submodule、symlink、prompt injection、誤検知reviewを試験する。

### `jev-router`

- 入力: 新しいuser turnの分類用要約、許可model一覧、cost／latency policy。
- 出力: 選択model、confidence、理由code、fallback、費用receipt。
- 実行: 既存Codex／Claude Code CLIを起動する前のrouting-only。CLIのsession、permission、authを維持する。
- 禁止: prompt改変、permission拡大、login token取得、任意CLI差替え、安価modelでの品質保証。
- 合格: resume／exec、引数転送、session保持、offline fallback、API failure、model unavailable、費用上限、manual overrideを確認する。

### `jev-browser`

- 入力: agentの一回計画、directional guidance、許可origin、観測されたbrowser element。
- 出力: 選択action、target、confidence、連続runner trace、verification。
- 実行: 既存browser toolの上に置き、Brokerが各stepを検査する。default agentへ自動設定しない。
- 禁止: installerの無審査実行、任意browser tool、既存profile、外部作用の包括承認。
- 合格: read-only owned siteでmulti-step navigation、stale target、redirect、popup、loop、stop、結果検証を確認する。

### `mobile-jev`

- 入力: Rock所有のwipe可能なdevice ID、許可app、goal、有限mobile action、step上限。
- 出力: action、画面state digest、request latency、trace、verification。
- 実行: Mobilerun sandboxまたは専用試験端末。個人端末とRockstarOS release端末へ接続しない。
- 禁止: SIM、連絡先、写真、mail、password、OTP、決済、account作成、booking完了、permission変更、app install。
- 合格: device binding、app allowlist、screen変化、keyboard、permission dialog、通知、電話、offline、reboot、duplicate action、emergency stop、trace削除を試験する。

## 9. 採用順

1. `awesome-jev-by-typesafe`をreference-onlyで固定し、実行権限を持たせない。
2. `openjev`と`jevlike`をoffline／owned fixtureで評価する。
3. `jev-review`と`jev-router`をread-only／routing-onlyで評価する。
4. `jev-ultrafast`と`jev-browser`をowned Web siteのobserve modeで評価する。
5. `typesafe-computer-use`を専用macOS account、`mobile-jev`をwipe可能なAndroid試験端末で評価する。
6. `jev-trader`を固定market replayとPAPERだけで評価する。

高い段階の合格を、低い段階の権限拡大に使わない。各Toolは独立に`candidate`から限定`ready`へ進める。

## 10. 全体受入条件

1. 10 repositoryのsource commit、MIT notice、依存lock、SBOM、model／dataset licenseを記録する。
2. offline test、lint、buildをclean環境で通し、network先とfile accessを観測する。
3. API keyやprivate dataがlog、prompt、artifact、crash reportへ出ないことを確認する。
4. Toolごとの正常fixtureと、scope外、secret、timeout、費用超過、cancel、crash、重複、結果不明の負例を通す。
5. Tool自己申告と独立Result Verifierを分ける。
6. install、disable、revoke、rollback、uninstall、data deletionを実演する。
7. 外部作用を含むToolはowned targetだけで試し、直前承認のない送信を0件にする。
8. `jev-trader`はPAPER以外を0件、`mobile-jev`は隔離端末以外を0件にする。
9. 代表taskで成功率、誤操作率、calibration、P50／P95時間、API call、費用、人の介入を再測定する。
10. 結果をSkyとZemaへ正確に表示し、candidateを「利用可能」「安全」「収益化済み」と表示しない。

## 11. 未決定事項

| 未決定                         | 決定者                                   | 決定に必要な証拠                                |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------- |
| 各repositoryの採用commit       | Tool maintainer＋security reviewer       | source／dependency review、offline test         |
| TypeSafe API契約とdata処理     | owner＋privacy／legal reviewer           | retention、region、subprocessor、cost           |
| local decision modelの採否     | Local AI担当                             | calibration、資源、model license、比較benchmark |
| 最初のbrowser／Mac／mobile対象 | product owner＋target owner              | owned fixture、規約、停止、削除試験             |
| review sourceの外部送信可否    | repository owner＋security reviewer      | data分類、redaction、provider契約               |
| Jev Routerのmodel policy       | AI platform owner                        | 品質、費用、latency、fallback評価               |
| 金融研究の継続可否             | product owner＋legal／financial reviewer | PAPER証拠、法域、risk review。LIVEは別承認      |

## 12. 現在地

- 完了: URL重複を整理し、公開READMEとlicenseを確認し、10件を役割分離してSky catalog、全Tool設計、設計台帳へ`candidate`登録した。
- 未実施: clone、source pin、依存導入、model download、API key、外部service契約、browser／Mac／Android／market runtime、実site受入。
- したがって「全部入れた」は、候補として発見・比較・設計できる状態を意味する。実行可能化と権限付与は各受入gateの後である。
