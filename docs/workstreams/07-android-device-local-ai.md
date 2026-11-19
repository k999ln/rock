## PixelのEve直行と端末設定（2026-11-02）

OS10/DSP01/WEB04、JOINT。[詳細契約](../rockstaros-complete-design.md#pixel-eve-entry)、[本人指定とasset](../../data/pixel-entry-design.json)、[検証証拠](../evidence/pixel-entry-design.json)。同署名APKの画面だけを更新。host stage試験、Android build/unit/lint、保全試験と実機操作を分ける。

## Pixelの既存接続復旧（2026-11-02 / OS10・DSP01・WEB04・JOINT）

通常site session欠落、認可pollの90日期限検査、Linux/sync停止を原因として確認。通信差1.5秒の回帰を再現し、expiresAtを変更せず上限判定だけ5分許容へ修正。同署名・同manifestのAPK 8fb99a11へデータ保持更新し、本人承認済みの同アカウント再接続を実機で完了。既存TLSv1.3認証、通常session保持、既存接続4hash不変を確認。既存0.5B/1.5Bキャッシュだけを準備し、最終Eveで「Pixel · Linux」「選んだ実行先は接続・準備済みです」、既存担当/Qwen2.5 1.5Bを確認した。入力空・実行同意未チェック・追加推論0・ダウンロード0。保存仕事34・model2・agent10は前後で各内容hashが一致、実行中0。一時診断APKだけを除去し、PixelはEve画面・同期中で返した。5回帰/87 APK単体/2 cache contract/4 stagingと読み取り実機1件×3回成功。全verifyは既存database:checkの進捗2ファイル再生成要求でexit1。実行品質・全OS・一般公開の受入、GitHub保存/main統合へは転用しない。証拠はdocs/evidence/eve-noah-publication.jsonのconnectionRepair。

再開手順：既存Terminalを起動したままアプリを切り替え、RockstarOSで同期確認→同期停止→保存済みAI照合→Eveが選んでいる既存モデルの準備→同じ準備状態の再照会→同期再開→Eveの接続・準備済み表示を確認。照合選択の有効期間は30秒、同期は最長30分。TerminalをAndroidの戻る操作で退出するとVMが止まる。通常/PC試用の接続は分離保持。再認可や新しい鍵を自動で増やさない。

## Pixelの公開v138ナビゲーション受入（2026-11-02 / OS10・DSP01・WEB04・JOINT）

Pixel10 GL066/frankel/Android17でavoado.siのEve/Noah/コミュニティー全6方向とroot→Eve、scroll後も残るheaderからの復帰を実操作。既存3tabを保ち確認tab追加、既存仕事/model/data/接続登録の変更と追加推論なし。実行先の接続必要表示を保持し、runtimeや全OSの合格へ転用しない。詳細・画像hash・残条件は[配備記録](../evidence/eve-noah-publication.json)のpixelFollowup。検証は既存候補全verify exit0、今回共有rootは既存database:check不整合でexit1。次は既存登録を保持するread-only実行先診断。

## Smith表記と部品なしのPixel目的入力（2026-10-23 / SKY21・OS10・DSP01）

最新状態（2026-10-24 / OS10・DSP01・SKY21）：本人がPC内試用接続を承認し、最新Rootの目的→担当登録→Pixel実推論→文章保存/別viewer開封→同じ仕事停止/待機を実操作した。初回export1961bytesは正規成果とhash一致。0.5Bの内容品質は不合格、保存済み1.5Bは時間切れで成果未受入。残存計算子を停止し、親終了時停止の修正を実機Linux小プロセス4/4で確認。同じ仕事の最新Eve画面で実停止を確認、実行中0。環境は停止中、Eve内モデル準備導線と内容品質は未合格。新モデル追加なし。通常サイトの端末credentialは保存先適用漏れで消失し本人へ通知済み、再ログインが必要。中央constructorで隔離保存を修正し実機1/1/JVM82通過。古いSky/Eve/Main仕事画面は試用APKの登録から除外、履歴も最新Eveへ接続。旧X接続専用試作はuser0から取り外しデータ/復元APKを保持、使い終えた試験APK2個と転送用一時folderを削除。Downloadの同一モデル重複2個1,278,893,376bytes削除、原本保持。詳細はdocs/evidence/smis-object-purpose.json#pixelNoPartsFollowup20261023.followup20261024。ROCK、実機JOINT、通常サイト再接続はOWNER。一般公開保留。以下は以前の確認時点の履歴であり現在の接続承認/保存先保持へ転用しない。

## 現行account runtime WorkPortの接続準備（ROCK）

[契約](../rockstaros-complete-design.md#eve-account-runtime-work-port)・[証拠](../evidence/eve-runtime-work-port.json)。既存queue個別readとowner intent、共通Core adapterを実装。33集中/型/対象lint成功、全体lintは別試験の12違反で失敗。担当作成/UI/native実機/ASR/音声/全入口は未受入。次は作成・prepare責任と現行eve-sync-workspaceへ結合。

## OS内を統一する共通Eve interaction（OS10/DSP01/CORE02/03/05/SKY21）

[正本](../rockstaros-complete-design.md#os-unified-interaction)。ROCKは一つのCore/画面・既存workflow/job/保存/停止への結合、EXTERNALは実入出力/BSP/ASR、JOINTは現行Pixel/native・Mini/Proの同一job往復、OWNERは本人確認/導入/費用確認。検証は`tests/eve-os-interaction.test.mjs`と`tests/mini-voice.test.mjs`、型/lint、portable/Pixel package、全verify。集中17/17・型/lint・portable build/61/export・Pixel package11hash・最終verify exit0（1553件/1552pass/1skip、API2113/CSV113/assets221欠損0）。証拠は既存avocado-mini-native-development.json#osUnifiedInteraction。現行native/account/Web全入口と実機は未完了。旧経路のadapter化を全OS統合完了としない。

## Mini音声一周のPixel先行（MAT15主担当、OS10/DSP01/SKY21連携）

[正本](../rockstaros-avocado-mini-complete-design.md#mini-hey-eve)。共通session/旧Pixel Linux browser UIのsource/fixture/packageは検証済み。現行native mTLS入口と端末内日本語ASRのadapter、同じ署名APKの導入と実音声/停止/待機は未完了。既存の本人データ/仕事/model/鍵を保ち、ASRの必要な追加がある場合は目的/出所/利用条件/容量を説明する。画面操作不通を別UI自動化へ迂回せず、合成認識文は実音声と分ける。根拠は既存avocado-mini-native-development.json#pixelVoicePreview。

## Pixel停止とカーネル再起動の復帰（OS10/DSP01/SKY21 / ROCK）

Linux VM単体の実boot変更と28仕事/鍵/成果/停止fence維持は受入。Android本体再起動の初回は古い固定socketで照会失敗。boot ID別の接続名と同じ永続停止journalへ修正後、本体の実再起動・本人解除・Terminal起動後の28仕事/鍵/成果/fence維持を受入。全OS imageや無人bootは別gate。Node25・Python3を集中確認し、`node --experimental-strip-types --test tests/pixel-runtime-bridge.test.mjs tests/pixel-runtime-stop-journal.test.mjs tests/pixel-guest-update.test.mjs`と実機の同28件を合格条件にする。鍵削除/flash/新規推論は行わない。詳細は[証拠](../evidence/pixel-durable-stops.json)。

## 待機中の共通実行先発見とWeb選択の衝突（OS10/DSP01/SKY21 / ROCK）

公開v112後の実Pixelで循環依存を再現し、idleでも同じowner/ABI確認後にpresence通知。最小Native5abbは54単体/lint/build・同一APKの実機3/3、既存26仕事/2モデル/6担当/6replica/鍵保持・testd21復旧を確認。Webは同一deviceIdの契約種類衝突をRootで修正し、1台表示/明示legacy pin/同意失効/期限と能力検査の回帰10/10。新Source openは自動審査が別候補の承認不足で拒否、Rootの固定full/UIを先行し、公開v112は保持。詳細と未受入は[既存証拠](../evidence/eve-presence-coexistence.json)・[全体契約](../rockstaros-complete-design.md#eve-presence-coexistence)。

## Eve LLMの製品同一性（2026-10-21 / AI02・AI05、ROCK）

本人訂正によりEveをLLM製品として扱う。Eve画面は対話・仕事の入口、技術profileには基盤重み/版/runtime/端末適合を固定する。ROCKはModelProfileと評価、EXTERNALは重み/license/runtime、JOINTはEve→Sky Tool一件の同一job receiptとhost/管理Linux/Pixel別実測、OWNERはデータ利用・モデル/費用/外部送信を決める。ニュースはEve News profileとして扱い、基盤候補のSarashina等をEveそのものと混同しない。最初の完了条件は、許諾付き評価集合、同条件の候補比較、越権/費用超過拒否、同一jobの実Tool receipt。`npm run llm:architecture:check && npm run design:check && npm run baseline:check`を設計検査に使い、`npm run verify`と対象端末実測を別に記録する。自社重み/実機/本番は未受入。[正本](../llm-evaluation-architecture.md#eve-llm-identity)。

## 共通runtime packageとEve（2026-10-21 / OS10・DSP01、MAT15参照）

本人の明示指示に従い、[portable runtime](../../packages/rockstaros-runtime/README.md)でdevice session→Eve履歴/仕事→既存見積・承認・usageへ接続するclient実装を追加。[責任・入出力・保存・復旧・合格条件](../device-support-architecture.md#portable-runtime-package)を正本とする。ROCKはSDK/既存workflow/料金API再利用、EXTERNALは各BSP/driver、JOINTは同一hardwareで受入、OWNERは本人接続と費用を担う。15件のhost試験とbuild/doctorは成功。各実機/native image、Miniの光学/衛星/MCU、local modelは未受入。次はpack単体検査→同じaccountのAPI→対象host adapter→Miniの実部品/BSP。基本料や顧客台帳を端末別に新設しない。

2026-10-20現行再設計とPixel会社ロゴ更新は[共通適応契約](../device-support-architecture.md#current-device-adaptation)、[同署名実機検証](../evidence/rockstar-redesign-branding.json)を参照。旧Buildroot/QEMUは選択再利用元。表示/自動試験と画面ロック解除後の目視、native OSの受入を分ける。

# Android / Device / Local AI

## Sky・Linux・Eveの同一仕事と認証付き接続（2026-10-21）

OS10/SKY21/DSP01/WEB04、ROCK担当。本人の開発指示を受け、既存workflow/jobを保ったままSky担当選択→Eve Activity→Linux実推論→同じ成果/使用額→Android picker保存→Eve再表示を実装した。本人Pixel、同署名候補、旧5199転送OFFで一周51.901秒、実推論18,788ms、保存808byteの独立hash一致。旧19仕事はbyte単位で変更なし、新規一件だけ、model2/agent6。下書きreviewは本人検収済みではない。

新native接続はAVF専用tapの相互TLS、Android Keystore専用鍵/Linux private鍵、公開証明書SHAの相互固定、失効時拒否、切断時の同じrequest ID照合を使う。Linux guestからprivate tap5198へ接続し、旧5199 forwarderに依存しない。Android追加権限なし、秘密鍵のexportなし、Terminal認証鍵/開発USBを日常の製品transportに使わない。旧Terminal forwarderの根本原因は未解明で、旧ブラウザ経路の課題として残る。初回pairingは開発者向け、一般enrollment/失効UI、Cloud/Webアカウント同期、全OS、全損復元、本番請求は別gate。

CSVは元missing-moduleを今回再現せず、build snapshotの独立copy・manifest/inventory照合を追加した。guard3試験、CSV113 assertions、全体verify exit0（Node1130成功/1skip、仕事API1578）。Android build/unit/lintは成功。同一候補hash、復旧試験の経過、設定復元は[実機証拠](../evidence/sky-pixel-linux-entry.json#skyLinuxEveDevelopment20261021)。[使い方・再現](../../toolkits/sky-linux-local/README.md)、[詳細設計](../sky-tools-complete-design.md#pixel-sky-eve-mtls)、[実行入口](../prompts/rockstaros-redesign-development.md)を更新する。次は一般向けpairing/失効と、認証付きWeb/Eveへの同じjob同期を実装する。

## Pixel再接続時の転送不調と縦断の再検証

2026-10-21、OS10/SKY21/DSP01・ROCKで、現行APK `cb14c10d…`の接続不能を再現。guest Sky稼働/Networkと転送の許可ON/Android5199待受なしを区別し、仕事0件実行中を確認してTerminalプロセスを再起動したところ復帰した。恒久修正は未完了。新規の合成依頼一件はnative画面→保存済み0.5B実推論→Android picker保存/読戻し→AI停止→画面再表示に33.732秒で合格。旧18件を保全し19件となり、Terminal停止後の534byteと次の26.060秒の起動後も同じ仕事/成果を照合した。元テストAPKを復元、開発者のUSB転送を除去。[証拠](../evidence/sky-pixel-linux-entry.json#connectedRecheck20261021)。次はforwarder初期化/VMライフサイクルと接続診断を修正し、既存workflowによるEveとの同一仕事・成果・費用の縦断を受け入れる。ROCKは接続診断/同一job/保存、EXTERNALはTerminal/AVF、JOINTは同一実機、OWNERは結果不明仕事の判断・保存先/内容確認を担う。本人用APKの合格を全OS・Provider・本番へ転用しない。

[端末別adapterの開発実行プロンプト](../prompts/rockstaros-device-adaptation-development.md)は、2026-10-21時点のmain/branch差分を先に同期し、OS10・DSP01でPixel縦断→既存OS client→Mini/Pro/相棒/その他adapterの順に進める入口。[共通OS・端末基盤プロンプト](../prompts/rockstaros-os-device-foundation-development.md)のCore/機種gateを先行させる。文書保存は実装・実機受入の証拠ではない。

## 端末別の能力・安全受入（2026-10-20 / OS10・DSP01、ROCK）

本人が指定したPixel、avocadoMini、avocadoPro、相棒端末、iPhone/一般PC、時計/TV/ロボット等の追加項目を[端末別正本](../device-support-architecture.md#device-specific-acceptance)と[data/rockstaros-device-adaptation.json](../../data/rockstaros-device-adaptation.json)へ記録した。ROCKは能力宣言とBrokerの権限・保存・復旧、EXTERNALはOS/部品/無線・光学・電池仕様、JOINTは同一機種・版の実測、OWNERは本人/保護者/場所/費用の許可を担当する。まずPixelの権限/Shell/Linux/model/保存/熱・電池を同一buildで照合し、Mini/Pro/相棒と既存OS client/その他adapterは各機器の実在能力と安全条件を個別に受け入れる。`npm run device-support:check`、`npm run design:check`、`npm run baseline:check`、`npm run verify`は文書・契約検査。端末実機、光学/RF/電池、ロボットの物理安全、公開受入は未実施として残す。

## AI・モデル管理の追加範囲（RQ48 / AI02・AI05、ROCK）

本人の2026-10-21指示による[Eve News 1.0](../llm-evaluation-architecture.md#eve-news-1-0)は、政治的立場だけでsourceを除外しないニュース草稿用LLMの設計である。[機械可読契約](../../data/eve-news-model.json)にsource/claim/下書き/訂正、120件以上の日本語・英語対照評価、公開までの別gateを置いた。主担当はAI02・AI05のModelProfile/資料scopeを持つROCK、Sky配信/掲載はSKY21/HOME01のJOINT。EXTERNALは基盤重み・runtime・媒体権利、OWNERは学習許諾・編集責任・発信先を決める。次は許諾済みsource packetと非公開の立場入替え評価集合を作り、Granite 4.2 3B/Qwen3.5 4B/現行基準を同条件で測る。`npm run llm:architecture:check && npm run design:check && npm run baseline:check`を設計検証入口とし、学習・実投稿は別受入。

2026-10-21の自社LLM構想は[実行SIモデル設計](../llm-evaluation-architecture.md#execution-si-owned-model)で設計段階にある。[取得元台帳](../../data/execution-si-model-source-catalog.json)には手動確認した発行元model card 15件、dataset card 3件、GitHub上流実装、X利用条件をmetadataのみ記録した。Hugging FaceのText Generation分類は同日426,979 repositoryを表示しており、15件は探索の起点である。派生/量子化を基盤系列へ束ねるmetadata収集を次の設計手順に加えた。主担当はこのAndroid / Device / Local AI、既存AI02・AI05を使い、Sky/Eve/AMCとの結合はSky/MCP workstreamと共同で受け入れる。ROCKは型付きplan・ModelProfile・評価、EXTERNALはベース重み/license/runtime/計算機、JOINTはEve→Sky Tool→実receiptと対象hardware実測、OWNERは学習許諾と予算・実行承認を担当する。次は許諾付きデータ契約と非公開評価集合を定義し、現行Qwen/recipe基準を同条件で測る。検証入口は`npm run llm:architecture:check && npm run design:check && npm run baseline:check`、受入時は同一artifactのhost/管理Linux/Pixelを別々に記録する。今回の設計はweights学習や追加profileの実機合格ではない。

2026-10-20の本人指示を[共通CoreのAI・モデル管理契約](../ai-native-os-architecture.md#ai-model-management)へ反映した。主担当ROCKは既存のAI02 manifest/stager/job pinとAI05の実行先能力を再利用し、Sky/Eveの選択理由・資料scope・Broker再検査へ接続する。EXTERNALはmodel/license/runtime/Cloud provider条件、JOINTはPixelと本人用Linuxの同一artifact実測、OWNERはmodel/資料/外部送信・予算を担当。合格は中断再開と全byte照合、二modelの同条件比較、local-onlyのCloud拒否、資料注入拒否、各stepのBroker再検査、model削除後の旧仕事閲覧を、host fixtureとPixel/Linux実測を分けて示すこと。`npm run baseline:check && npm run design:check && npm run llm:architecture:check`、AI02/AI05のfocused tests、端末/Linux同一artifact試験、`npm run verify`を検証入口にする。現状は設計反映であり、汎用catalog/任意model/Cloudの実行受入ではない。

## avocadoPro内部構成の一次候補（2026-10-18 / OS10・DSP01、ROCK）

[内部設計と公開仕様の出典](../device-support-architecture.md#pro-internals)へValue（RTX 5060 Ti 16GB/64GB RAM/2TB NVMe）、Performance（RTX 5090 32GB/128GB RAM候補/4TB NVMe）、Compact AI研究（GB10統合メモリ）を分けた。Proの役割はMiniから離れた場所で承認済みの制作を同じjob/revisionへ返すこと。ROCKは署名起動候補/仕事・権限/保存・復旧契約、EXTERNALはGPU/OEM/driver/model/OS供給、JOINTは実カード入り同一試作機の熱・電力・騒音・推論とMini往復、OWNERは対象作品、地域、GPU調達、販売価格を担う。まずValue一台の実寸CAD/BOMと限定制作一周を受け入れ、同じ条件でPerformanceを比較する。GPU多枚数の初期販売、大量調達、性能/価格の確定は行わない。文書検証は`npm run device-support:check`、`npm run design:check`、`npm run baseline:check`、`npm run verify`。実機証拠は別記録する。

## Proを机から離れて使う（2026-10-18 / OS10・DSP01、ROCK）

Miniからの本人承認済み制作jobをProで処理し、途中版・費用・成果を同じSky／Zema job/revisionへ返す。[共通端末間設計](../device-support-architecture.md#shared-si-device-profiles)。ProのGPUを積むだけではこの体験にならない。端末間grant、availability、ネットワーク断、熱保護、成果保存、同一jobの再開を対象hardwareで受け入れる。ROCKはBroker/成果契約、EXTERNALはPro部品とOS/model、JOINTはMini/Pro同一試作機の往復、OWNERは最初の制作対象と費用/共有を担当。Pro実機・遠隔起動・local AI性能は未合格。検証入口は`npm run device-support:check`、`npm run design:check`、`npm run verify`で、物理試験とは別に記録する。

## avocadoProはAI専用PC（2026-10-18 / OS10・DSP01、ROCK）

利用者はProの製品種別を**AI専用PC**と明示した。従来の用途未定の上位端末候補という記述を訂正する。Pixel・Miniと同じSI Core／Sky／Zemaのowner・job・承認・費用・成果・復旧契約を使い、PC上のAI／Agent仕事と受入済みlocal処理、本人が承認したcloud処理を扱う。PC本体、CPU／GPU／NPU、RAM、OS、model、価格、実機性能は未指定。[設計と受入](../device-support-architecture.md#shared-si-device-profiles)が正本。ROCKは共通契約・Device Profile／Broker、EXTERNALは選定したPC部品・OS／model供給、JOINTは同一PCでの起動・推論・熱・停止・更新・復旧、OWNERは構成・入力共有・cloud費用を担当する。最初の合格証拠は版付きPC仕様と能力snapshot、同一jobのlocal AI成果、承認済みcloud経路、停止・再起動後の成果照合。`npm run device-support:check`、`npm run design:check`、`npm run baseline:check`、`npm run verify`は文書・契約検査であり、実PC受入ではない。

同日、利用者の価格対抗とNVIDIA GPU重視の構想を受けて[外観モック10案](../avocado-pro-mocks/README.md)を作成。01／02／04は単GPU入口、03／06は単GPU上位、08は複数GPU候補という比較軸。画像だけで部品型番、VRAM、複数GPUのmodel分割、価格、熱、電源、供給を確定しない。次は候補を絞って実BOMと対象jobのtoken/s・電力・騒音・停止／復旧を同一PCで測る。

続く明示好み「Mac Studioみたいなのがいい」により、低い角丸アルミ筐体の[Studio系10案](../avocado-pro-mocks/README.md#studio方向今回の好みに合わせた10案)を追加。12を単GPUの第一外観候補、20を価格比較、18／19を拡張比較とする。EXTERNALの部品寸法・電源/冷却仕様、JOINTの同一試作機での熱・電力・騒音・local AI job/停止/復旧、OWNERの価格/調達判断が合格するまでSKUとは扱わない。

## GrapheneOS Terminal／AVF Linux 10時間調査の結論（OS10、2026-10-18）

調査窓は06:16 UTC頃から17:02 UTC以降の最終整理までで、予定した16:16 UTCを超えている。一次資料の定点調査とPixel読取り専用観測は14:39 UTCまで記録され、その後はこの最終照合である。**10時間連続して操作・精読した計測記録はない**ため、暦上10時間超を実働10時間や実機合格へ換算しない。出典48件、観測値、未検証36件は[同一証拠](../evidence/graphene-terminal-source-audit-20261018.json)に保持する。ROCKが限定Broker/成果契約、EXTERNALがGrapheneOS/AOSP/guest、JOINTが同一PixelのVM・保存・復旧、OWNERがVM導入・モデル・外部作用を担当する。

| 問い | 確認した事実 | RockstarOSへの判断 |
| --- | --- | --- |
| Terminalとは | [AOSP公式](https://source.android.com/docs/core/virtualization/usecases#linux-development-environment)はDebian系を非保護AVF VMとして起動し、Terminal画面から操作する開発環境と説明。Pixel 10 GL066/frankelのAndroid 17・2026100601ではTerminal package有効、観測時VM processなし | Linuxは**端末内の任意作業場**候補。Cloud LLMそのもの、OS image、Sky Agent共通実行APIではない |
| 何を作れるか | 公開guest imageはaarch64 Debian 13系。Git/Python/Node/compilerの同梱は未確認。Android Studio Linux ARM hostは[公式非対応](https://developer.android.com/studio/install)、full GrapheneOSの[build要件](https://grapheneos.org/build)は別のx86_64 Linux環境 | 小さなscript、有限Tool、LLM試作はguest inventory後に試す。署名APK/full OSの標準buildをPixel VM内で成立済みと表示しない |
| local LLM | Pixel hostにAVFとVulkan compute feature、Terminal overlayにgfxstream対応flagはある。guest GPU compute・NPU・VM RAM・モデル速度/熱/電池は未観測 | [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)のAArch64 CPU経路から、モデルhash/license、weights+KV+scratch、token/s、熱を実測。GPUはguestのVulkan compute実証後に限る |
| Sky/Zema接続 | [公開AVF API](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/libs/framework-virtualization/README.md)はVM owner appを境界とし、Terminal公開AIDL/protoにSky Tool実行・成果receipt APIなし | Terminal owner側の限定Broker接続、またはRockstar所有VMを別途設計。owner/job/revision/scope/入力hash/短命grant、有限artifactの独立検査と一回だけのcommitが必要 |
| 保存・停止 | 公開Terminalの旧rootfs backup/対話復元は同アプリprivate領域。VM owner process終了や強制停止で稼働仕事は不明状態になり得る | 成果を本人別Rockstar保存へ取り込み、guestとCloudのreceiptを分ける。取消・失効は新規grantを止め、結果不明の外部作用を盲目的に再試行しない |
| SIM/eSIM失効 | AndroidのSIM/eUICC APIは通信profileを示すがRockstar契約の支払済み証拠ではない | 回線、本人、サービス利用権、端末導入を別状態にする。失効時は新規有料Cloud処理を止め、汎用Terminal/電話/既存成果取得を同時に破壊しない |
| browserが遅い | PixelでVanadiumとWebViewの版は読取り確認済みだが、Skyの画面trace未取得 | 同一Pixel・回線・仕事で入力反応、描画、network/API、Provider待ちを分解測定してから改修する |
| Mini/Proへの移植 | PixelのGrapheneOS image/AVF binaryを両機種へ移植した証拠なし。Mini R5物理受入0、ProはAI専用PCと確定したが正本hardware未確定 | 共通にするのはSI job/権限/費用/成果の意味論。Miniは実在するDSP出力、Pro AI専用PCはhardware/OS/model選定後のprofileで別々に合格させる |

最初の実装順は (1) Pixel/guestの版・実RAM/disk/runtime/port/保存の本人承認付き観測、(2) licensed小型modelのCPU推論と既存Android APKとの同条件比較、(3)既存`rockstar-csv-cleanup`の合成UTF-8小入力を受入済みbundleでhost/guest byte・hash一致、(4)private Broker transportとowner/job/revision/grantを結ぶ原子的artifact commit、(5)取消・強制停止・再起動・失効・請求不明の復旧、(6)Cloud signed usageとローカル実行receiptの別照合、(7)同条件browser計測、(8)Mini/Proで別hardware受入、の順。これは**優先案**で、現在いずれのguest実行・adapter実装・料金受入・full OS flashも完了していない。次の担当は既存dirty差分を保全してから同一fixture/同一Pixelの証拠を作る。

2026-10-18 Terminal一次資料チェック（OS10／ROCK）: [AOSP Linux開発環境](https://source.android.com/docs/core/virtualization/usecases#linux-development-environment)は、既定で無効なTerminal system appから非保護AVF VMのDebian系guestを起動する設計。接続Pixelの2026100601 security previewに対し、最も近い公開署名base [2026100600 manifest](https://raw.githubusercontent.com/GrapheneOS/platform_manifest/2026100600/default.xml)でVirtualization SHAを固定して調査。[固定VM Controller](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/new2/core/VmController.kt)はflagとguest buildId 5106以上でttydをvsock経由のlocalhost＋secret keyへ、それ以外でHTTP探索へ分岐する。端末上のguestとflagは未確認で経路を断定しない。[固定Settings](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/new2/ui/main/SettingsViewModel.kt)のVM memory既定値1024 MiB／UI上限70%はsource値であり、接続Pixelの実割当ではない。Terminal manifestはVM管理・外部storage・録音・network等の権限を宣言するため、本人向けTerminalを第三者Sky Agentの無制限実行面とみなさない。Pixelのread-only観測ではTerminal packageは有効だがVM processは未観測。ROCKはowner/job/revision/scope/予算を固定する限定成果adapter、EXTERNALは上流Terminal／AVF、JOINTはVM実機の起動・資源・port・保存／復旧と同一job成果往復、OWNERはVM起動・model導入・外部作用を担当する。[証拠](../evidence/graphene-terminal-source-audit-20261018.json)。

固定sourceの追加境界: [Bridge](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/AndroidToVmBridge.kt)のlocalhost cookieをSkyの本人承認へ代用しない。[Installer](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/new2/core/Installer.kt)はguest取得を既定Wi-FiのみとするためeSIM開始とTerminal導入を分離する。[InstalledImage](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/InstalledImage.kt)のrootfs backupは同アプリのprivate storage内であり、Rockstar成果物の別保存・復元が必要。実機でguest imageや容量は未確認。

09:38 UTC追補: 接続Pixelのread-only package/WebView provider確認ではbrowserとWebViewがともに[Vanadium 155.0.8059.84.0](https://github.com/GrapheneOS/Vanadium/releases/tag/155.0.8059.84.0)。OS imageとbrowser更新を分け、遅さの原因を現時点で断定しない。[Chrome公式Performance法](https://developer.chrome.com/docs/devtools/performance/overview)に従い同一端末・回線・jobのload／input／resultをLCP/INP、main thread、network／API／Provider時間へ分解する。今回の端末UI traceは未取得。[llama.cpp Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md)のAPK／TermuxとLinux guest推論を別受入にする。既存`lib/workflow.ts`のrecord transportはbrowser／local-mcpだけでLinux runnerはないため、Broker承認・owner/job/revision/scopeと成果hashを写す限定adapterが必要。Mini R5実機0、Pro仕様未確定を維持。

固定sourceの[port許可状態](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/PortsStateManager.kt)は番号で持続し、[AIDL Debian service](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/DebianService.kt)は開いたportとの交差をforwarderへ渡す。SkyはTerminalの持続許可をTool権限へ昇格させずjob/session別に失効する。[Storage balloon](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/StorageBalloonWorker.kt)はhost割当可能量から1 GiBを予約する。Pixelの`df /data`空き約27 GiBはguest容量を保証しない。実port到達性とguest容量は未測定。

10:44 UTC追補: 公開2026100600の[Debian VM設定](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/build/debian/vm_config.json)は`/storage/emulated`共有を要求する。[固定ConfigJson](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/ConfigJson.kt)は`Environment.isExternalStorageManager()`が真のとき現在Android userの共有ストレージをguestへ渡し、[guest mount](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/build/debian/cloud-init_config/root_files/etc/systemd/system/mnt-shared.mount)は`/mnt/shared`に接続する。Pixelのread-only `dumpsys package`は`MANAGE_EXTERNAL_STORAGE granted=true`だが、`appops get`はNo operations/defaultであり、実効判定・guest image・mountは未観測。共有を成果busへ転用せず、本人指定の有限fileをsize/type/hashとowner/job/revision/scopeで隔離取込する仮説を追加した。[旧rootfs backup](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/InstalledImage.kt)は同アプリ内移動後に新guestへdisk接続され、[復元対話](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/build/debian/cloud-init_config/root_files/usr/local/bin/restore-backup)がhome copyと選択packageのapt再導入を行う。自動完全復元や端末喪失復旧ではなく、skip／failure・package version差・Rockstar成果の別保存を受入する。実機guestを起動せず、研究継続中。

契約失効の技術境界も[Android SubscriptionManager](https://developer.android.com/reference/android/telephony/SubscriptionManager)のactive SIM一覧と[EuiccManager](https://developer.android.com/reference/android/telephony/euicc/EuiccManager)のeUICC有効判定で確認した。どちらもcarrier支払やRockstar月額の正本ではない。既存[SIM-led設計](../sim-led-product-architecture.md)のissuer認証済み終了event／契約期限、Rockstar entitlement、期限付きoffline leaseを分ける。汎用Terminalや成果回収を課金失効で消す設計にはしない。公開ferrochrome 5.1.0 aarch64 archiveの2026-10-18 HTTP HEADは607,391,791 bytesで、固定Installerの700 MiBはfallback表示値。接続Pixelのdownload/実使用量は未観測。

開発能力の境界: 公式[Android Studio Linux要件](https://developer.android.com/studio/install)はARM CPU hostを非対応とし、[NDK host tag](https://developer.android.com/ndk/guides/other_build_systems)はLinuxに`linux-x86_64`を指定。[GrapheneOS build要件](https://grapheneos.org/build)はfull OSにx86_64 Linux・32 GiB以上のRAM・大量のsource/build storageを要求する。公開guest archiveはaarch64向けだがPixelの実guest ABI・packageは未観測。TerminalをGit/Python/Node・小さなLinuxプログラム・Agent試作の候補にし、Android APK/NDKや署名full OSの標準buildをVM内で成立済みとしない。既存の専用x86_64 Linux build gateを維持し、端末内の代替APK toolchainは別実験として扱う。最初の非金融成果往復候補は既存`rockstar-csv-cleanup`の`transformCsv`を**合成CSVだけ**でhost/guest byte・hash・report一致させる案。現行の本番CSV決済を通さず、カタログToolや料金は変更しない。guest Nodeと依存package/transport/資源は未検証。

11:40 UTC追補: [固定Debian image生成](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/build/debian/build_internal.sh)はDebian 13 trixieのaarch64 genericcloudを検証後に取り込み、[guest追加package](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/build/debian/build_rootfs_in_chroot.sh)はGUI／audio／Vulkan関連等を明示するが、Git／Python／Node／compilerの同梱を示さない。これらはDebian arm64の導入候補であり、接続Pixelのguestに導入済みとはしない。[Debian trixie arm64 nodejs](https://packages.debian.org/trixie/arm64/nodejs)は現在20.19.2系列。既存`lib/csv-transform.ts`はTypeScriptと`iconv-lite`依存のため、最初の合成CSV Toolも検収したJS bundleと依存を配布するか、別途承認されたruntimeを用意してhostとのbyte/hash/report一致を取る。Node package一覧だけでguest実行を合格としない。

12:39 UTC補正: 現行`package.json`の`engines.node`は`>=22.13.0`で、Debian trixieの標準Node 20系はmonorepoの要求を満たさない。`lib/csv-transform.ts`が直接importする`iconv-lite`もルート`package.json`の直接依存にはなく、現`package-lock.json`には推移的に存在する。VM用ToolはNode標準packageやlockfile内の偶然の依存に頼らず、受入済みのNode 22.13以上＋明示依存、または独立に互換性を検査した自立bundleをhash固定する。合成CSVのBOM／UTF-8、CRLF、数式安全出力、CP932失敗例をhostとguestでbyte／hash／report一致させる案。まだbundle作成・VM導入・試験はしていない。

[固定AVF API説明](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/libs/framework-virtualization/README.md)はVM接続を起動owner appに制限し、`MANAGE_VIRTUAL_MACHINE`を制限付きSystem APIとする。[固定Terminal Debian AIDL](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/libs/debian_service/aidl/com/android/virtualization/debian/aidl/IDebianService.aidl)と[guest control proto](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/libs/debian_service/proto/DebianService.proto)の公開interfaceはport、storage、clipboard、shutdown等で、任意のSky Tool実行・成果receipt RPCはない。別Sky APKからTerminal所有VMへAVF直接接続できる前提を外す。OS統合のTerminal owner側へ限定Broker adapterを足すか、Rockstar所有の独立VMを設計して実機受入する。手動ファイル取込みは別の限定経路であり自律Agent実行の証拠ではない。[AOSP VM service](https://source.android.com/docs/core/virtualization/virtualization-service)ではVM CIDは停止後再利用され得るので恒久IDにしない。[固定VM Controller](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/new2/core/VmController.kt)にはguest shutdown要求と即時`stop()`の別経路があり、後者は電源断相当。job停止時はgraceful shutdown、期限後は結果不明を照合してから強制停止し、外部作用を無条件再実行しない。guest常駐を24時間Cloud Agentの保証にしない。

12:36 UTC追補: 公開固定の[Terminal manifest](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/AndroidManifest.xml)はVmServiceを`exported=false`とし、[VmService](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/new2/core/VmService.kt)の`onBind()`はnull、開始は`START_NOT_STICKY`。Stop通知は`VmController.stop()`を呼ぶ。[AOSP VM lifecycle](https://source.android.com/docs/core/virtualization/virtualization-service)ではowner processがlow-memory killでVM handleを失うとVMも止まる。公開baseからは別Sky APK用の直接実行口や24時間常駐保証は見つからない。接続端末の2026100601差分・実停止挙動は未確認。

現行作業木の`app/api/work-jobs/route.ts`でCloud AgentのZema結果手順は、remote delegation完了、保存済みartifact、Providerの利用receiptを要求する。`lib/a2a-usage-receipt.ts`の署名付きreceiptは料金版、金額、利用量を含む。Linux guestのローカル実行receipt／fileをCloud Agentの請求証拠へ代用しない。既存`lib/workflow.ts`はLinux transportをまだ持たず、別のBroker受入を設計する: owner/session/job/revision/attempt/Tool/入力hash/短命grant→guest実行→有限成果の型・size・hash照合→一度だけ保存。取消とeSIM失効は新規grantを止め、稼働中の仕事は安全停止要求と結果不明照合を分ける。VM停止／再起動後、非金融で副作用のない決定的処理は未確定確認後に新attempt可能だが、有料／外部作用は既存Provider／台帳を照合するまで再実行しない。これらは研究上の状態案で、runtime実装・実機受入ではない。[証拠](../evidence/graphene-terminal-source-audit-20261018.json)。

実行先選択の現行schema制約: `contracts/device-capability-snapshot.json`のv3は30秒有効なAndroid公開APIのlocal観測で、`deliveryMode=existing_os_client`、`localInferenceCompatibility=not_evaluated`、`nativeOsCompatibility=not_evaluated`、推論runtime候補は`llama.rn`のみ。AVF Debian guestの実割当・package・GPU/NPU・Tool/model適合、Mini R5／Proの物理出力を証明しない。CAPABILITY-PLACEMENT案はこのv3を完全な多機種能力表として消費せず、Pixel guestと機種別DSPの別版・期限・実機根拠を持つsnapshotが受入されるまでlocal実行を閉じる。Mini R5の実機合格は0、Pro仕様は未確認。schema変更は今回行わない。

13:39 UTCのGPU／memory境界: 公開[Debian VM template](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/build/debian/vm_config.json)は`memory_mib=4096`・GPU backend `2d`だが、[固定VmController](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/new2/core/VmController.kt)は起動時にSettingsのメモリ値（公開既定1024 MiB）で上書きし、[GraphicsManager](https://raw.githubusercontent.com/GrapheneOS/platform_packages_modules_Virtualization/2adc78f4f364322535d773e00aa79464d95000ed/android/TerminalApp/java/com/android/virtualization/terminal/GraphicsManager.kt)が対応・選択した場合だけGfxstream Vulkanへ切り替える。Pixelの読取り専用`cmd overlay lookup`は有効Terminal overlayの`gfxstream_supported=true`を返した。これはGPU compute／NPUがguestのLLMから使える実測ではなく、利用者の現在の私有設定も未観測。[llama.cpp公式build](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)はAArch64 Linux CPUのKleidiAI候補と、別条件で`vulkaninfo`・`GGML_VULKAN`・検出GPUを要求するVulkan経路を示す。モデル適合は実guestのABI、割当RAM・disk、Vulkan device／compute queue、重み＋KV＋scratch、初回／継続速度、熱／電池で判定する。VM起動自体が端末状態を変えるため今回行わず、受入項目だけを[証拠](../evidence/graphene-terminal-source-audit-20261018.json)に記録した。

14:39 UTCの成果受入境界: 現行[composition executor](../../lib/work-composition-executor.ts)の`rockstar-csv-cleanup`は文字列12,000文字上限、UTF-8入力／強制UTF-8出力で`result.output`を成果textにする。[raw CSV変換](../../lib/csv-transform.ts)と[CSV job保存](../../lib/csv-job-store.ts)の10 MiB binary／CP932／独立`spreadsheet-safe.csv`とは受入対象が異なる。最初のLinux parityは合成UTF-8小入力と同じnode設定・bytes/hash/checksだけに固定し、CP932とsafe版は次の別gateとする。[現行workStore](../../lib/work-store.ts)は仕事rowだけをrevision CASするため、追加するguest成果とjob遷移を別々に確定させない。[D1公式batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)はstatement失敗時rollbackするが、条件付き更新0件は失敗とは限らない。owner/job/revision/grantとreceipt一意性を同一transactionで照合し、実更新件数を確認する。手動file取込みは[Android公式SAF](https://developer.android.com/training/data-storage/shared/documents-files)の本人選択URI候補だが、Android 11以降は`Android/data`内を選べず、guestからpicker可視の場所へ明示exportが必要。選択後も即時size/hash検証とRockstar保存へコピーする。どれも設計と受入案で、transport／schema／VM実行は未実装。[詳細証拠](../evidence/graphene-terminal-source-audit-20261018.json)。

2026-10-18追加・訂正（OS10／DSP01、ROCK主担当、MAT15／18と連携）: Pixel、avocadoMini、avocadoPro AI専用PCへ共通SI Core／Sky／Zema契約を広げ、実際に確認した機種能力だけで出力を選ぶ。[機種別契約と受入](../device-support-architecture.md#shared-si-device-profiles)。EXTERNALは各OS／SoC／表示・sensor供給、JOINTは同一試作機のboot／出力／停止／復旧、OWNERは出力先・共有・有料実行・機器変更。Pixel GrapheneOS／AVFの能力をMini／Proへ転記しない。最初は既存Android capability v3と共通job／artifactの差分を洗い、Mini R5で成立した出力を一つ選んで同一fixtureのhand-offを設計する。ProはAI専用PCとして、hardware・OS・modelの正本確定後に加える。検証入口は`npm run device-support:check`、`npm run design:check`、`npm run baseline:check`、release前に`npm run verify`。設計更新は端末受入ではない。

## 最小SI端末imageの搭載範囲（2026-10-18 / OS10・RLS02）

主担当ROCK。利用者の最新指示に基づき、Pixel 10 GL066／`frankel`の初期Home／imageをCloud LLM、Sky Marketplace／Agent、Zema、任意Terminal/Linux、汎用browserへ絞る。Game／Wallet収益面、Fund、汎用Tool一括導入、ローカルLLM weightsは初期必須搭載から外す。OS安全基盤、SIM/eSIM、Vanadium/WebView、OTA、backup／復旧、費用予約／usageは残し、RQ01〜RQ49の応用契約を破棄しない。[具体的な保持／除外と受入](../device-support-architecture.md#graphene-si-minimal)。EXTERNALは上流・Provider、JOINTは同一端末の性能とfull OS受入、OWNERは端末操作と有料実行を担当。次は既存main／branch差分を保全同期し、初期package allowlist、PixelのSky/browser同条件測定、Cloud一件のProvider sandbox受入、Terminal能力調査を別々に進める。合格条件は対象imageの起動・通信・署名OTA・保存／復旧、仕事一件の見積〜成果・usage、before/afterの速度実測。`npm run baseline:check`、`npm run design:check`、`npm run device-support:check`、`npm run android:first-flash:check`、`npm run verify`で設計と既存契約を照合する。設計更新はfull OSや速度改善の実証ではない。

追加の明示指示では、初期imageにweightsをプリロードしないまま、本人が適合するローカルLLMを後から選択・切替できるようにする。既存固定Qwenの実機証拠と任意model導入を区別し、第二profile、license/hash/runtime/端末適合、熱／電池、再起動後の選択保持を受入する。Terminal/Linuxの限定成果はBrokerを介した型付きartifactとしてSkyへ返し、guest rootからhost権限を得ない。[model境界](../llm-evaluation-architecture.md#user-selectable-local-models)と[Sky Add](../sky-tools-complete-design.md#sky-add-agent-ecosystem)。

## GrapheneOSの長所の再利用（2026-10-10 / OS10・RLS02）

主担当ROCK。利用者の明示方針を[多機種設計](../device-support-architecture.md#graphene-reuse)へ反映。既存GrapheneOSベース、Broker／Shell、Linuxユーザー空間実装を再利用し、権限・隔離・署名更新を保持したままRockstarの体験を追加する。Terminal／AVFは開発と限定Tool実行先の候補とし、transport・対象Tool・保存／resource制約は実機能力調査後に決定する。EXTERNALは上流・機種対応、JOINTは互換と実機受入、OWNERは入力・外部作用・費用・端末変更を担当する。

次はmainと既存作業branchの差分を保全して同期し、Pixelのhost／Terminal／guest能力を読取り確認、非金融Tool一件の往復案へ進む。合格条件は本人・scope・revision・job一致、改ざん／重複拒否、取消・結果不明、VM停止／再起動・保存／復旧と実測性能。`npm run baseline:check`、`npm run design:check`、`npm run device-support:check`、`npm run android:first-flash:check`、`npm run verify`で文書・既存契約を確認する。今回は設計のみ、Linux adapter実装／VM実機／full OS／公開の合格ではない。

## Web統一デザインのPixel反映（OS10 / RLS02、2026-10-09）

ROCK担当。公開v47の共通色・枠線・選択表示を既存Shellの4画面へ適用し、Home末尾に同じpublic Siteをブラウザで開く入口を置く。接続済みPixel 10 GL066へ同一署名・データ維持で上書きする。合格条件と復旧境界は[OS全体設計](../rockstaros-complete-design.md)のPixel共通外観節、結果は[実機記録](../evidence/pixel-unified-design.json)を参照。

## Pixel Shellの操作・デザイン（OS10 / RLS02）

2026-10-09の開発・デザイン改善依頼により、GitHub main0455499dと一致するAndroid実装を基点に、ホーム／Sky／仕事／設定へ分割した。中性の面・罫線・文字、常設タブ、画面端とキーボードの余白、適応型アイコンを実装。依頼引継ぎでは同意を解除し、既存下書きの置換は本人確認を要求する。接続先未設定と通信障害、`no_model`と推論可能を分ける。Brokerと課金承認の契約は維持した。端末情報を隠していたLocal AI API版不一致（画面v2／実runtime v4）も修正し、契約版の照合と実機のfresh snapshot表示を追加試験した。

保持済み署名でShellだけを`adb install -r`更新。前後の仕事件数0・article Tool選択revision1・未設定アカウント・no_modelが一致し、実機APK hashも候補と一致。7件の非破壊UI instrumentation、SDK build/lint、Core111、SDK7、source/OS/design検査が合格。旧APKと写真・OSは削除していない。実機4画面の表示と操作を確認。全体verifyと最終画面の証拠は[今回の受入記録](../evidence/pixel-shell-design-20261009.json)を参照する。Cloud実行、model推論、full OS、全損復元は未受入。

再現: Java17 / Gradle8.11.1 / SDK35で `gradle -p android :shell:assembleDebug :shell:assembleDebugAndroidTest :shell:lintDebug :core:test :tool-sdk:testDebugUnitTest`。実機では署名一致を確認して上書きし、`adb shell am instrument -w -e class dev.rock.shell.ShellNavigationTest dev.rock.shell.test/androidx.test.runner.AndroidJUnitRunner`。このsuiteはBrokerを初期化せず、課金・仕事実行を行わない。一般の既存統合suiteは試験用データを変更するため、所有端末で無選別実行しない。次は実service originと署名済みmodelの個別受入、およびGit workstreamの既存統合順序で最新mainへ取り込む。main統合は未実施。

## Pixelの旧名試験APK更新（2026-10-09 / OS10・RLS02）

担当ROCK。9月16日のavocadoOS試験APKを実byte hashで特定し、旧署名鍵不足によるデータ削除を本人が明示了承後、4試験アプリだけを同一の保持済み開発署名で再導入した。main0455499dの合格済みAndroid 3 APKと、build入力が同mainに一致するLocal AI v3を使用。候補と端末のhash4/4一致、RockstarOS表示、Shell→Broker応答、SkyのTool選択のShell再起動後保持、Local AI Binderのno_model応答を実機確認。今回のarticle Tool実行、端末全体の再起動、Local AI推論、クラウド接続先／account／Provider、OS image・flashは未受入。旧アプリ内データは了承どおり削除、端末OS・写真の初期化はしていない。旧APKと限定rawデータ退避は復旧保証ではない。次は同じ保持済み署名を継続し、実service endpointと署名済みmodelを別gateで設定・受入する。詳しいSHA・コマンド境界・残る条件は[更新証拠](../evidence/pixel-app-refresh-20261009.json)。


## SIM/eSIMサービスの利用開始におけるAndroidの役割（2026-10-01）

## 2026-10-02 製品要件監査と優先順位

| 要件 | 再利用できる実装 | 現在の限界／次の作業 |
|---|---|---|
| SIM/eSIM購入後、短い導線で利用開始 | channel-neutral signed entitlement、`/connect` claim import、owner-scoped device account link、capability snapshot。Android Shell API v18はlinked device sessionからBroker経由で同じowner claim APIへ登録する。Worker/D1 synthetic API suiteは署名claim初回redeem・same-owner retry・cross-owner拒否・tamper拒否・device-home capabilityを確認 | 購入先が使うissuer-hosted one-time redeem link/codeと失効・再発行契約、物理SIMの販売/配送、実Carrier activationが未接続。native Java/AIDL/APK/device acceptance未実施 |
| 販売offerごとに初期Agent構成を変え、後から追加 | `ROCKSTAR_SERVICE_OFFER_PROFILES`が署名claimの`issuerId + offerId`を版固定のSky package key/manifest hashへ結び、entitlements/device-homeとWeb/Android Shellへ状態を案内する | 合成packageでのみローカル試験済み。Healthcare/Lifeline用の実packageと本番offer設定、端末install/execute acceptanceは未完了。claimは自動install/実行を許可しない |
| Sky/Zema/Agentへ一度の認証でアクセス | Rockstar account session、Android Homeの直接entry、service scopes | Shellから一部serviceが開けることと、対応全SKUのinstall/onboarding受入は別。SIM activation aloneではloginしない |
| 簡単な依頼、進捗、成果 | durable encrypted Cloud LLM queue、owner-scoped device-home/detail、A2A task status/artifact、terminal result retrieval、restart recovery | Shell Homeはforeground中のbounded pollingと再接続時readback、task detailは同じjobのprogress・usage・成果を取得するsourceを持つ。Android SDK/APK/device表示とOS終了後の通知受入は未確認 |
| 利用前の単価・見積と支出上限 | signed rate cards、task quote、approval digest、A2A reservation/live meter | 通常通貨表示、quote-bound native Wallet hold、Cloudと一致するBroker proof、別操作のoffline continuation consent、最終Cloud承認UIまでsource接続済み。実際にAgentをdispatchするCloud execution flagはclosed。直接LLMは予約上限を表示するがProvider live spend meterは未提供 |
| 利用後の明細と予算超過防止 | signed final usage receipt verifier、itemized settlement、per-task cap binding | Signed receiptの検証・Wallet settlement経路と、A2A progress/live snapshot/final receiptの表示sourceがある。Provider公開鍵inventoryが未設定ならWallet同期をfail-closedにする。ローカルreceipt/usage行は顧客請求ではない |

2026-10-02のquote verifier追加後の実装更新: Android Coreはprovider-signed quoteの正確なrequest/agent/currency/maximum、署名有効期間、明細、operator trustを検証し、そのquote digestとparent capをnative hold/approval digestへ固定する。Shell/Broker経路は同一delegation IDをstable task IDにしてWallet hold作成、同一holdからのみ端末鍵proof署名、Cloudへのproof登録、利用者が別途許可するoffline continuation、最終Cloud承認、結果不明時の同ID readbackとINDETERMINATE fencingまでsource接続済み。2026-10-02後続のAIDL v16では承認画面から最終Cloud PATCHを明示送信し、受理後にWallet状態をDISPATCHEDへ照合する。初期quote-verifier／reservation-bridge監査の「後続holdが未接続」は当時の状態であり、現行状態の説明には使わない。関連証拠: [quote verification](../evidence/android-a2a-price-quote-verifier-20261002.json)、[native reservation Core](../evidence/android-a2a-native-reservation-core-20261002.json)、[Cloud approval and recovery](../evidence/android-a2a-cloud-approval-recovery-20261002.json)。

2026-10-02 status boundary: local Node/Worker fixtures and TypeScript/source-contract checks exercise Cloud authorization, recovery, budget/approval binding and fail-closed pricing. The Cloud A2A execution feature flag remains disabled, so the enabled dispatch branch and actual connected Agent execution are not accepted. Provider usage/invoice, funded Wallet, production Cloud durability, and production D1 are also not accepted. The current host has `adb` but no Java runtime, Gradle executable/wrapper runtime, or SDK manager, so Android JVM/JUnit, AIDL/APK compile, instrumentation, and device UI were not run. Do not describe source connection as device acceptance or billed service.
| 機種に合ったOS/client | device attestation/capability design、既存OS Shell/browser route、Pixel GL066 OS investigation | SKU allowlist別のsigned OS image/boot/rollback受入とAndroid APK/Binder/device testを継続。eSIM能力はOS互換性を意味しない |

今ターンの実装修正: 見積前は通貨単位（例 `1.00`）を受け付ける一方、承認時だけ同じ欄をminor unitの整数として再解釈していた不整合を修正し、見積時と同じISO通貨fraction-digit parserを使う。静的回帰testで、承認経路も同parserを通しminor-unit再parseをしないことを確認する。Android Gradle wrapper/SDKに加えて利用可能なJava runtimeもこのcheckoutにないため、native formatter/app/APK/instrumentation compilationは未検証。Node source contract testsのみ通過。

次の優先順位: (1) Android JDK/SDK CIでAIDL v16、P-256 enrollment/revocation、Provider trust config、quote-bound holdと同ID recovery suiteをcompile/instrumentationし、失敗を直す、(2) CI/device上で一つのCloud Agent fixtureを見積→native hold→offline同意→明示承認→端末切断→Cloud継続→再接続後の同job進捗・結果・receiptまで通す。execution flagはProvider契約・rate/meter/invoice/Wallet受入まではclosedを維持、(3) Android Homeのforeground/reconnect復帰をexact supported deviceで受入し、OS終了後の通知が必要ならWorkManager/通知権限経路を設計、(4) signed issuer redeem link/codeのrecovery・失効、production provider billing/funding、carrier purchase/activation、対応SKUごとのOS/client install acceptanceを別gateで進める。Android Provider公開鍵inventoryはGradle property `a2aProviderUsageKeysJson`からAPKへ渡すsource構成で、既定`[]`または不正設定はOS全体を止めずWallet受取だけをfail-closedにする。これは設定配線であって実Provider鍵・契約・請求の受入ではない。ローカルusageは請求証拠にしない。

## 2026-10-02 satellite transport research refresh

Official-source recheck: au Starlink Direct「専用プラン＋」 permits physical SIM or eSIM for eligible UQ/povo/other-carrier users, but service remains limited to supported handset/app traffic and does not prove arbitrary Rockstar cloud/API reachability or wholesale resale. Current public terms list three free months followed by ¥1,650/month for other-carrier users, subject to change; it is not our carrier price. Ordinary voice/110/118/119 calls remain unavailable. KDDI separately documents a Japan-only SOS-message relay through approved apps and its SOS center; that is neither direct emergency calling nor a Rockstar emergency service, and rescue is not guaranteed. KDDI's developer portal requires Android 16+ or iOS 26+, an eligible plan/SIM/eSIM and supported device; listing is application-based, with a six-month app-age criterion and separate agreement discussions. Android constrained satellite use needs app opt-in and low-bandwidth adaptation. The current Shell does not implement satellite transport detection or KDDI allowlisting; do not turn on the manifest opt-in until the product can reliably queue, bound, label and recover satellite traffic. Pixel 10 being listed as a mock-test handset is not GL066 field acceptance. See [current source evidence](../evidence/satellite-connectivity-research-20261002.json) and [carrier/provider decision record](../provider-contract-readiness-20260930.md#衛星通信-日本のmvpは既存キャリアのdirect-to-cell連携).

SIM/eSIM購入をRockstarOSサービスへの入口にするが、SIMへOSを格納する・SIMを入れたら任意端末へOSを書き込む仕様ではない。Androidの実装は端末の正確なSKU、署名済みimage、OEM boot/復旧許可が揃う場合のfull OS導入と、既存Android上のclient/Shellで使う導線を分ける。eUICC機能やcarrier profile installだけからRockstarOS互換性を推定しない。購入権利、carrierのprofile有効化、端末上のOS/client導入、Cloud service entitlementは別状態で、同一owner/accountに束ねる。

再利用: device capability snapshot、profile challenge、hardware-backed Broker enrollment、eSIM install proof/entitlement、channel-neutral signed service claim、Rockstar device-account session、Pixel GL066 Developer Preview調査、Android Shell/Sky/Zema、offline A2A recovery。現行方針（2026-10-02）は物理SIM/eSIMの購入をRockstarOSサービス利用の入口とし、複数販売チャネルがサービス利用権を含める。OS binaryはSIMへ置かない。直接Cloud LLMは署名rate-card/quote/cap、encrypted durable input、queue recovery、実行後明細のsource/UIを持つ。残る不足: seller checkoutと購入者delivery integration、physical SIM/carrier activation、Provider live meter/invoiceとfunded production billing、Android SDK/APK/Binder/device acceptance、supported exact-SKU OS install/client acceptance。

販売、物理SIM配送、carrier contract、OS書込み、端末初期化はこのworkstreamから自動実行しない。Android host/JVM試験やfixtureを通信開通・OS導入の証拠に数えない。

2026-10-01 Cloud Wallet device-side ledger checkpoint: Android-independent Core now verifies the shared Ed25519 Cloud A2A receipt and persists a matching native Wallet hold/settlement lifecycle in PlatformStore schema v4. Exact owner approval reserves a spend cap; other approved spending can use only the remaining balance. A hold releases only before dispatch. After dispatch, indeterminate or restored work remains held until the same signed Provider receipt is independently verified and one append-only debit is committed; recovery converts active holds to `RECOVERY_REQUIRED` and blocks resend/release. Core JVM suite passes 65/65, including 3 hold/settlement/recovery cases. [Receipt verifier evidence](../evidence/android-a2a-usage-verifier-20261001.json) · [Wallet lifecycle evidence](../evidence/android-a2a-wallet-reservation-20261001.json).

The Core now also accepts the exact `rock-a2a-wallet-settlement-handoff/1` envelope and `a2a.budget.settle` command after matching reservation owner/job/delegation/currency/cap/deadline, then independently verifies and settles the Provider receipt. A changed parent binding is rejected in the local integration test. Broker Gateway/Shell still do not invoke this method. Test funding and the RFC test key are synthetic. `AndroidA2AWalletHandoffSource` now implements the signed HTTPS source contract for the server's device-key-authenticated POST route: it fixes the origin/path, refuses redirects/cookies/non-JSON/compressed or oversized responses, bounds time and bytes, signs a fresh short-lived owner/device/delegation request with the injected enrolled Broker signer, and returns a no-store response map to Core for independent receipt verification. This is source-only and not yet called by Shell/AIDL; server-confirmed owner/key/device enrollment metadata, persisted native reservation creation, user-triggered reconnect sync, and Android SDK/APK/Binder/device validation remain open. Do not present it as production billing or live device behavior.

2026-10-01 reconnect checkpoint: added `A2AWalletSettlementSync` as an Android-independent Core orchestration seam. On reconnect it asks an injected authenticated/no-cache handoff source for the owner-scoped cloud result, then calls the existing exact-envelope verifier and Wallet settlement. Repeated fetch/application remains idempotent; an offline fetch exception leaves a dispatched reservation held and does not retry agent execution or release funds. Added `A2AWalletHandoffRequest` to produce the exact short-lived owner/device/delegation request signed by an injected Ed25519 Broker key, plus a shared RFC-test-key vector that the Java Core and Cloud WebCrypto verifier both accept. JVM suite passes 69/69 and Node handoff-auth tests pass 4/4. The test vector key is public and synthetic. AndroidKeyStore-backed production Ed25519 enrollment/signing, HTTPS transport, AIDL/UI trigger, APK/Binder wiring, and device acceptance are still missing.

2026-10-01 initial Broker key checkpoint (superseded 2026-10-02): the first Android automation implementation used Ed25519 and described its KeyStore certificate chain as attestation. Current AOSP schema says the attested asymmetric-key algorithms are RSA, EC, or ML-DSA; the existing server verifier in this repository specifically verifies P-256. The Ed25519 version was never Android-SDK compiled or device-tested and is replaced below; do not use its attestation claim as evidence.

2026-10-02 Broker key and signature compatibility checkpoint (superseded in part by the later v11 entry below): `A2ABrokerDeviceKeyStore` provisions a non-exportable AndroidKeyStore P-256 key, uses the server-provided 32-byte challenge, requires TEE/StrongBox backing, returns the uncompressed 65-byte point and attestation chain, and locally retires/reopens by the point's SHA-256 key ID. Java/JCA ECDSA DER signatures are converted to fixed-width 64-byte P1363 for the existing Android/Cloud handoff envelope. Cloud authorization and Wallet handoff verifiers accept both existing operator-trusted Ed25519 raw keys and P-256 SEC1 points; the trust inventory accepts either form without allowing a key to enroll itself. Synthetic Node tests cover both signature paths; API/D1 suite passes 863 assertions and the Cloudflare Workflow controlled fixture passes 10/10. The later source update adds server enrollment/revocation UI/API and Shell AIDL calls. Android source remains uncompiled and the instrumented signing/attestation test remains unrun because the Android SDK/JDK is unavailable. Official algorithm reference: [AOSP Key Attestation schema](https://source.android.com/docs/security/features/keystore/attestation). Production trust and provider acceptance remain open.

2026-10-02 loopback acceptance refresh: API/D1 integration passed 862 assertions; Cloudflare Workflow suite passed 10/10 (nine A2A controlled-fixture lifecycle tests and one Remote AI hard-gate test); encrypted-input/store/public-record/A2A-client tests passed 23/23, including immediate deletion of encrypted prompt material on queue cancellation and independent Node/Python A2A protocol fixtures; TypeScript passed. The new Remote AI test confirms only that the paid gate stays closed and creates no send claim. It does not exercise successful Remote AI dispatch. No provider network calls, production Cloudflare binding, funded Wallet, Android SDK/APK/Binder/device, carrier activation, or OS install were accepted. [Evidence](../evidence/remote-ai-cloud-workflow-local-20261002.json).

2026-10-01 account link service checkpoint: server-side device authorization now starts a one-time 8-character user code plus 256-bit device code; `/connect/device` shows the app name and asks the signed-in Rockstar ID holder to approve or deny. A 90-day account-bound bearer session is returned once after approval, stored server-side only as SHA-256, accepted by existing `requestUser` APIs, and individually revocable from the same page. Local D1 end-to-end tests cover cross-origin refusal, one-shot issue/replay refusal, expiry, entitlement, Sky and Zema API identity, session listing without token exposure, and revocation (711 Worker/D1 assertions). Android-independent Core now implements the `begin`/`poll` protocol and passes as part of the 72/72 Core JVM suite. Android source now adds Broker-only exact-origin HTTPS, bounded redirect-free JSON transport; no-backup AES-GCM session storage under AndroidKeyStore; AIDL v6 operations; and Shell code display, browser handoff and polling UI. The service origin is a required Gradle property, with no production default. Android sources/instrumentation are authored but uncompiled/unrun because the SDK is absent; no APK, Binder/device acceptance, installation-time account continuity, production identity session, or Broker-key registration is proven. Details: [device account-link contract](../rockstar-device-link.md), [local evidence](../evidence/rockstar-device-link-local-20261001.json).

2026-10-02 account-link identity binding continuation: the one-time poll response now includes the Rockstar account subject authorized by the browser approval, and Android Core requires it before accepting the grant. The no-backup AES-GCM session record stores the subject with the bearer token and binds both to the configured origin/package, allowing later local Wallet/recovery work to use the actual cloud owner instead of an invented Android-local ID. The earlier API count of 863 belongs to that checkpoint; the current Worker/D1 route suite is recorded at 914 assertions. Device session storage format advanced to v2; the instrumentation test covers owner persistence but was not run.

2026-10-02 Android A2A Broker enrollment bridge source: Shell AIDL/API v11 now exposes explicit user-triggered P-256 enrollment, server-first key revocation, and read-only Wallet handoff synchronization. Broker obtains a per-install no-backup deviceRef, requests the authenticated owner's five-minute server challenge, creates the matching hardware-backed Android Keystore key, submits its attestation chain, and reconciles a lost registration response with the server device list before deleting any local key. The Shell UI shows attestation/TEE status and requires an explicit confirmation before revocation. Wallet handoff first requires an existing owner/delegation reservation, then performs the existing signed no-cache POST and Core receipt verification; it never dispatches work. A retried revocation can finish local key deletion after server revocation. Source contract tests cover the AIDL, transport, Broker flow and UI. Android SDK/Gradle are not available in this checkout, so Java/AIDL compilation, instrumentation and device behavior are not verified. `RockApplication` currently constructs `PlatformStore` without a provider receipt trust inventory and there is no Android flow to create a reservation from an approved Cloud A2A quote; settlement therefore correctly remains blocked until those source/configuration gaps are filled. No local test proves provider billing or a real device attestation.

2026-10-01 SIM-led device service-home bridge and task readback: added owner-authenticated `GET /api/rockstar/device-home`, returning service scopes/entitlements plus recent cloud LLM pricing/state and Agent state without prompts, with a saved-result snippet only when storage was explicitly chosen. It labels invoice and funded Wallet as unverified. Android Broker reads the existing Keystore-encrypted session internally, calls only exact-origin allowlisted GET paths with bounded JSON/no redirects/no cookies, and exposes them through Shell AIDL v8; the Shell can open LLM itemized usage/result, Agent state/live meter/receipt, and owner-authorized Agent artifacts after an explicit row action. Operation kind and task ID are validated before path construction. Added Worker/D1 integration checks for authentication, no prompt leakage, state readback, and invoice/funded-wallet flags; `npm run test:api` cannot run here because localhost `listen` returns `EPERM`. Focused SIM-entry source test, TypeScript, production web build, OS contract checks, targeted Oxlint and project-progress check pass. Android SDK/APK/Binder/device acceptance remains open; this is not production billing, carrier activation, successful OS installation, or live provider execution.

2026-10-02 native Cloud LLM queue flow: Shell API v10 adds quote creation and a separately consented quote-reserve/submit sequence. The user enters a request, ISO currency and per-request maximum; RockstarOS creates a signed-rate quote without contacting the Provider. The remote OpenAI submit path now validates the exact approved request, encrypts it into owner/execution-bound AES-GCM storage, and returns only after the durable D1 row is recorded. The accepted job receives a fixed 24-hour execution deadline after the short quote approval window. A scheduled Sky Agent Runtime controller starts a deterministic Cloudflare Workflow. The Workflow rechecks entitlement/rate/budget and uses a one-time external-send claim; uncertain dispatch is never automatically repeated. Detail/home API output marks an accepted request as queued. Android expects an explicit durable acceptance receipt and tells the user to retrieve progress/results from the same owner-scoped cloud task list after reconnection. No Provider call is possible while the pricing gate is hard-disabled. `REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY` must be provisioned as a 32-byte hex secret in both the API worker and runtime worker after contract/security review; it is not committed. `OPENAI_API_KEY`, signed trusted rate-key configuration, worker/D1 bindings and a provider meter/receipt reconciliation adapter are also required before execution. TypeScript, encryption unit tests and schema checks pass. Workflow integration could not start under the current localhost `listen EPERM`; Android SDK/APK/AIDL/Binder/device verification remains unavailable. The source is implemented, but Cloudflare durability, external billing, actual provider execution, carrier activation and OS installation are unaccepted.

## 2026-10-02 native Cloud A2A cancellation

Shell API v17 adds a user-confirmed cancellation action for an owner-selected Agent delegation. It sends one PATCH and, if the response is lost, performs only a same-ID owner-scoped GET. The UI reports pre-dispatch cancellation, cancellation requested, remote stop confirmation, terminal-before-cancel, and uncertain outcomes separately. An accepted cancellation request is not labeled as a stopped Agent; uncertainty never triggers automatic cancel replay. Existing Cloud Workflow `cancel_submitting` one-shot state and signed final usage settlement remain authoritative. Source/API, Cloud store and Workflow tests pass; Android build and device behavior are still unverified. [Evidence](../evidence/android-a2a-native-cancel-20261002.json).

## 2026-10-02 final Cloud approval handoff and reconnect recovery

Shell API v16 adds a distinct, user-confirmed Cloud approval after the existing quote review, native Wallet cap approval, and same-device Broker proof registration. The final screen repeats the maximum amount and states that the Cloud Agent may continue while the device is offline. Approval sends one PATCH for the exact saved delegation ID; it does not automatically retry. A read-only owner-scoped Cloud lookup after approval promotes the local HELD cap to DISPATCHED only when Cloud state proves approval was accepted. If the request outcome or readback is uncertain, the cap becomes INDETERMINATE and remains unreleasable while same-ID recovery is required. After process restart, Wallet settlement sync first reads the Cloud delegation and can reconcile an accepted hold before proceeding. Only readback-proven `expired` or `cancelled_before_dispatch` states, or an awaiting draft with expired Broker proof, permit pre-dispatch release.

The native home polls active Cloud tasks at the API-provided interval bounded to 10–120 seconds while the Activity is foregrounded; it stops polling on pause and performs a one-shot refresh when validated connectivity returns. The native detail view renders the last five owner-scoped progress events and itemizes the already-verified signed A2A live snapshot/final usage receipt. It checks line totals before display. Direct LLM detail includes final token-category pricing; before the final Provider response, the interface labels actual use as unreported and shows the reserved maximum separately. A live actual-spend meter for direct LLM is not available from the current provider response path and remains a Provider/contract acceptance requirement.

The Cloud execution feature flag remains disabled by default; the production route rejects final approval before mutation while disabled. This is a local source/contract implementation and does not prove Cloud dispatch, Provider execution, metered billing, or Android acceptance. The local host lacks a usable Java/Gradle/Android SDK toolchain, so AIDL/Java compile, APK, instrumentation, and airplane-mode/reconnect acceptance remain open. See [approval/recovery evidence](../evidence/android-a2a-cloud-approval-recovery-20261002.json).

## 目的

共通RockstarOS Coreを正確な機種／SKU向けDevice Support Packageへ組み込み、Android/AOSPのfull build、署名、flash、boot、OTA、rollback、純正復旧を実機で成立させる。端末内AIはこの実機基盤の上で最小権限にする。

## 現在地

- Android P1はBroker／Shell／Toolの3 APK、SQLite、Binder、JobSchedulerを実装。Shell API v4でnative Sky選択をBroker SQLite schema v2へ保存し、Zemaをselection tokenへ固定したうえで、所有者24単語backup v2のexport／importを追加した。Android 15 emulatorはBroker 11件＋物理専用2件skip、Shell 5/5を合格。所有Pixel 10ではBroker／Tool／Local AI／Wallet 11件、Shell 5件、Operator Agent 5件、実再起動2段階の計23/23が合格し、native Sky selection、途中仕事、結果、review、履歴、非破壊backup exportを復旧した。data／Keystore消去後の24単語復元は純正復旧artifactを揃えた管理試験として残る。
- 最初の実機対象は読取り専用ADBで日本向けPixel 10／frankel／GL066へ確定。Pixel 7／pantherは保留。物理端末gateは機種／SKUのみ合格の1/6。SELinux enforcing分離とCDD／CTS／CTS Verifier／VTSを独立した未達gateにした。
- GrapheneOS `2026091000` tag署名、manifest／adevtool／laguna-muzel 6.6、実機のDynamic Partition／Virtual A/B／AVB 1.4を固定済み。Google純正factory／full OTAの公式URL・掲載SHA-256・同一build・実byte hash検査、vendor全file inventory／再検証、署名policy／手順hash freezeをbuild入口へ実装し、合成fixture 9/9が合格した。Google実ファイル、実vendor生成、HSM／署名bridge、full Soong build、flash、実機bootは未実施。
- 外部Providerは初回OS full buildから分離し、アプリ／サーバー側へ置く。実収益を表示する1.0公開前にはProvider sandboxを必須とし、未合格中はlive収益表示をしない。
- Local Action AssistantのAPI v2 artifactはsource pin、base＋plan-v2 overlay hash検査、署名限定Binder、JSON Schema計画専用経路、arm64 APK build、Qwen GGUFの機内モード推論、再起動復元、33分22秒の実機熱試験まで合格。最初の選択Toolとの実機接続と全23項目の非破壊再起動受入も合格した。これらの実機結果はv2 artifactに限り、現在のAPI v3 source overlayはTypeScript/Jest/Lintとclean patch適用までの確認で、native build・v3実機推論は未実施。OS image搭載、production署名、SELinux／OTA、Keystore消去後の復元も未完了。
- Operator Agentは試験署名Pixel 5/5に加え、本番公開trust入力をrepo外から静的RROへstageする検査を実装した。StrongBox必須、factory reset無効、P-256／origin／challenge検証と、challengeへ結び付く端末鍵aliasをAndroid 15 emulator 6/6で確認した。本番値投入、attestation検証、Device Owner実行、複数端末向けdynamic enrollmentは未完了。
- Platform Core v1はTool／MCP／Provider共通AIDL、APK署名・UID照合、本人確認付き承認、Wallet台帳、schema v1→v2 migration、dual-wrapped backup v2、所有者phrase UI、transactional restore、新Keystore再binding、更新／rollback gate、source SELinux policyまで実装中。`dev.rock.automation`をheadless Brokerとして残し、Home／Sky／Zemaを`dev.rock.shell`へ分離するsource、Android Gradle build／lint、emulatorとPixelのBinder統合試験は完了。物理wipe復元、AOSP full build、SELinux enforcing boot、production署名は未実施。
- AI02 sourceとして、RuntimeManifest／ModelProfileManifest validator、PlatformStore/Engine schema v2→v3 migration、Broker runtime identity binding、profile activation generation、owner/job version pin、Engine `submitPinned`とrun Ticketへのprofile bindingを追加中。同一DB再起動後もprofile ID/version/generationを維持する。ZemaOrchestratorは推論前にprofile pinを作り、runtime API/package/signing identity・loaded GGUF SHA-256・byte lengthを照合してからAPI v3 planを呼び、完了後にも同じidentityを再確認して`submitPinned`へ保存する。同一owner/request digestの再送は既存pinned jobを返して推論を重複させない。上流Local Action AssistantのAPI v3 patchをbase＋plan-v2 patch後へhash固定し、clean sourceへ順次適用できることを確認した。上流sourceのTypeScript、Jest 20件、ESLint、offline manifest checkが合格。検証記録は[profile API v3 source validation](../evidence/local-ai-profile-v3-validation-20261001.json)。Android-independent Coreは一時Temurin 17／Gradle 8.11.1でcompileし、Engine／PlatformStoreとEd25519 publisher verifier／artifact pipelineとBroker private weights stagerの46 JUnitが合格した。実行で発見したplan schema grammar、Ticketへのprofile identity伝播、Java compile不整合も修正した。[Core JVM validation](../evidence/ai02-core-java-validation-20261001.json)。信頼鍵ID・publisher結合、manifest署名、失効、署名確認前のstaging禁止を実装した。Broker内のModelProfileActivationCoordinatorを追加し、PlatformStore candidate登録→署名検証→weights staging→API v4 read-only descriptor handoff→runtime receipt/status照合→active pointer commitを接続した。load/commit失敗時は旧モデル復帰を試みる。PlatformStoreはactive workと直近のplan reservationがある間はモデルを切り替えない。Core JVM validationを更新し46/46合格。本番trust keyset/source、user-facing catalog/API、license receipt、tokenizer/template stagingは未実装。weightsはBroker private storageへ保存後、API v4の`installAndLoadModel`でread-only ParcelFileDescriptorだけを別UIDのLocal AIへ渡すsource経路を追加。Brokerとruntimeの両方でSHA-256／byte lengthを検証し、runtime private no-backup領域へatomic copy後、loaded profile IDをstatusとreceiptで確認する。v3 sourceを基点にした連続overlayのclean apply、TypeScript/Jest 23件、ESLint、offline manifest checkは合格。[API v4 handoff validation](../evidence/local-ai-model-handoff-v4-validation-20261001.json)。ただしAndroid SDK platform/build-toolsがないためAPI v4 Kotlin/AIDL/APK buildとBinder/device試験は未実施。Android coordinatorからinstaller RPCを呼ぶsource経路は実装したが、user-facing catalog/API・production source/trust keysetがなく、Native buildおよび実行時接続は未検証。tokenizer/template/license receipts、production keys/source、offline model inferenceも未受入。backup pin復元、第二profile実推論、active verified profileは未完了。
- Broker-owned `deviceCapabilities` protocol v3をShell snapshotへ追加し、[schema](../../contracts/device-capability-snapshot.json)へ固定。eUICC feature、`EuiccManager.isEnabled()`、MEP申告に加え、Android公開APIからbuild報告の機種名/API level、総RAM・空きRAM、アプリ領域の空き容量、touchscreen/keyboard/audio/camera/connectivity featureを30秒のlocal observationとして返す。新たにDevice/Profile Owner enrollmentとAndroid 15 managed-subscription API適格性、organization-owned deviceでの自動profile有効化適格性を同じsnapshotへ加える。これはeSIM chipの対応確認に加えて管理形態を端末内で識別するもので、carrier privilege、対象plan/profile適合、LPA、空きport、端末実証を推定しない。Profile Ownerでも個人所有端末は自動有効化対象にしない。さらに署名一致・version/API固定を通過したLocal AI Binderの状態（ready/no_model等、`llama.rn`）を記録する。Zemaが選択Toolの計画を作るときは、Brokerが推論前と完了後に同runtimeでmodelLoaded/readyを再確認し、確認できない場合は仕事を保存・queueせず`LOCAL_AI_NOT_READY`で止める。これはruntime APIの現在状態でありmodel profile identity、weight hash、device fit、RockstarOS適合の証明ではない。既存の物理Pixel offline推論証拠とも区別する。Shellは資源・feature・runtime・eSIM管理tierを表示し、未知版・期限切れを未確認に戻す。ICCID/EID/profile一覧を読まず、`READ_PHONE_STATE`も追加しない。profile有無・data plan適合・RockstarOS全体適合は別々に未確認／未評価とする。classifier状態試験とShell↔Broker instrumentationのschema・permission境界試験、`check-os-contracts.mjs`の契約検査を追加。Android SDK platform/build-tools/NDKと接続Android deviceはなく、APK／AIDL buildとinstrumentationは未実施。
- eSIM status APIはProvider profileと有料Sky注文のbinding、端末へのprofile install、RockstarOS端末利用権を別の状態として返す。通常Androidアプリから`EuiccManager.downloadSubscription()`を管理するにはsystem permissionまたはcarrier privilegeが必要で、active subscription一覧も`READ_PHONE_STATE`またはcarrier privilegeが必要となる。現在の製品Brokerはこれらを要求しないため、Profile installは`unverified`、eSIM device entitlementは`not_connected`のままにする。契約先/OEMが注文digest・owner/device challengeへ結び付いた署名付きinstall証跡を提供できるかは未確認であり、[契約準備書](../provider-contract-readiness-20260930.md)にsandbox質問として固定した。[Android `EuiccManager`](https://developer.android.com/reference/android/telephony/euicc/EuiccManager) · [Android `SubscriptionManager`](https://developer.android.com/reference/android/telephony/SubscriptionManager)

2026-10-01実装追記: host APIはcarrier/OEM署名付きinstall receiptを検証した後に限り、同じowner/device/order/profile digestとStarter Pack bundle hashを結んだ5分challengeを発行する。challenge responseには端末での署名に使うowner/order/profile/install receipt/starter pack contextを含める。Android-independent Coreの`EsimDeviceEntitlement`はprivileged installer adapterからの`verified + installedEnabled`証拠とcontextを照合し、hardware-backed P-256鍵に限ってES256 receiptを生成する。JVM testsは5件成功し、JavaとTypeScriptが同一canonical bytesを使うfixtureを追加。WebCrypto raw署名形式へ変換し、期限切れ、証拠不在・別owner/device、software/revoked/別曲線keyを拒否する。Core全体51/51、eSIM receipt tests 6/6・eSIM host全体51/51、Worker/D1 API 376 assertions、typecheck/buildが成功。`npm run verify`はNode 550/550、Fashion 19/19、API 376 assertionsでexit 0。Telephony権限やICCID/EIDアクセスは追加していない。これはAndroid SDK moduleへの組込み完了ではない。AndroidKeyStore adapter/enrollment/attestation、OEM eUICC install evidence provider、AIDL/Binder wiring、Android APK/instrumentation build、Provider sandbox、実機利用権表示は未受入。契約先/OEMから署名proofと鍵発行・rotation・revocation authorityを得るまで、実機接続は未確認のまま扱う。[契約準備書](../provider-contract-readiness-20260930.md)

2026-10-01実装追記: Android Key Attestationの鍵登録前検証用に、公式`android/keyattestation`をcommit `55c35040a1b5b72e6d63bfb150c5c68a175c1462`へ固定して隔離JVMサービスへ組み込んだ。Google production rootsと最新オンライン失効状態、fresh 32-byte challenge、完全一致するpackage/minimum version/signing SHA-256、TEE/StrongBox、locked device、Verified Boot `VERIFIED`、P-256鍵を要求する。失効状態取得不能時はfail closed。loopback bindを既定とし、remote ingressは明示設定を要求する。Workerの権利発行routeは共有のattested activation関数を呼び、証明書チェーン提出→TLS/bearer認証service call→challenge・package・commit・public-key digest照合→署名済みactivation receipt検証→同じD1 batch内で鍵／entitlement保存を行う。status APIはattested keyのactive/revokedと実hashを再確認する。JVM service tests 4/4、pinned upstream tests 180/180、Verifier-client tests 4/4、共有activation関数のWorkerd D1正常系・鍵不一致拒否2/2、D1 storeの同時登録を含む5/5、Worker/D1 API 424 assertions（controlled verifier service bindingを経由するdynamic route acceptanceを含む）、全Node tests 595/595、typecheck・lint・production buildが合格。全体`npm run verify`もexit 0。[検証証拠](../evidence/android-key-attestation-verifier-20261001.json)・[service runbook](../../services/android-attestation-verifier/README.md)。このroute受入はMiniflare上のcontrolled verifier doubleであり、JVM service自体をWorkerから呼ぶ実環境接続を証明しない。AndroidKeyStore/Broker/AIDLへの接続、production allowlist/secrets/ingress、Android SDK build・実端末 enrollment、OEM eUICC proof・Provider sandboxも未受入。fixture合格をdevice/production合格へ転用しない。

主なtask: `DSP01`, `OS02`〜`OS11`, `N03`〜`N05`, `RLS02`。Local AIは`OS07`〜`OS09`、Platform Coreは`OS10`〜`OS11`で追跡する。新設計のモデル更新は`AI02`を進行中、記憶・外部作用・app能力は`AI03`〜`AI05`として分ける。

2026-10-01実装追記: Shell API v5へBroker専用`provisionEsimGatewayKey`を追加し、Android Shellの開発者設定から認証済み注文画面のchallenge JSONを手動受け渡しできるようにした。Coreの`EsimGatewayEnrollmentChallenge`はUUID、base64url 32-byte nonzero nonce、5分+30秒以内の期限、Google authority／key-ID rule／automation packageを検査する。Brokerはnonce-derived AndroidKeyStore aliasでTEE/StrongBox P-256鍵を新規生成し、同じnonceでの再送は同じ鍵・attestation chainを再利用する。public keyと24KB以下のDER chainだけをShellへ返し、画面/APIの状態は`pending_server_and_install_proof_verification`で固定する。AIDLにowner IDを指定する引数やtelephony/eUICC読取り権限は設けない。Core JVM suite 60/60（新challenge validator 3/3を含む）、`npm run os:check`、`npm run android:architecture:check`、`npm run verify`（Node 595/595、Fashion 19/19、API 424）は合格。Android API/AIDL sourceは接続されたが、SDK platform/build-toolsなしでBroker/Shell APK compileとinstrumentationは未実施。browser→appの自動challenge handoff、証明書・install receipt・device signatureを認証済みWorkerへ一括submitする導線、carrier/OEM installer証拠、Verifier private TLS接続、Provider sandboxは未受入。手動開発UIは契約前の実利用開始を意味せず、プロファイル有効化も行わない。

## eSIM／端末形態の適合表

eSIM chipの検出は、OS全体・通信plan・特定provider・LLM・端末内agentの適合とは別判定にする。eUICC対応でも地域SKU、carrier、現在のprofile/port空き、通信band、端末unlock状態で導入・service成立が変わる。Androidは`FEATURE_TELEPHONY_EUICC`と`EuiccManager.isEnabled()`を別に確認し、profile秘密値やEIDをShell/Webへ渡さない。[Android eUICC API](https://developer.android.com/reference/android/telephony/euicc/EuiccManager)

| 形態・対象 | eSIM／初期設定の判定 | RockstarOSの提供形態 | ローカルLLM・入力・資源 | 現在の根拠と未達 |
|---|---|---|---|---|
| Android phone：Pixel 10 Japan／GL066（最初の物理対象） | Brokerで実機feature・enabledを読む設計。carrier、profile空き、plan/band適合、install／network attachは別の未確認状態 | native OSを目標とするが、flash／boot／OTA／recoveryを含むOS適合は未合格。既存Android上のleast-privilege clientは別提供形態 | Google公称Tensor G5、12GB RAM、128/256GB、6.3-inch touch display。試験署名APK上でoffline GGUF推論・再起動復元・33分熱試験の証拠あり。別model、署名済みOS内推論、実provider Tool実行は未合格 | Google Japan specはnanoSIM+eSIMまたはeSIM×2を記載。機種/SKUはread-only ADB確定。provider install/network attachmentは未実施。[Google Pixel 10 specs](https://store.google.com/jp/product/pixel_10_specs?hl=ja) · [実機受入範囲](../phone-preview-20260911.md) |
| iPhone | Appleがモデル・地域別のeSIM有無を公表。carrier/region条件に従って設定・QR等を利用。Rockstarアプリからprofileを直接管理できるとは仮定しない | iOS client。OS置換・bootloader installは対象外 | modelごとのRAM/storage/GPUをApple側で確認できる範囲まで使用。local LLM対応を一律保証せず、Web/cloudへの切替を選べる。touch/voice/accessibilityはiOS clientで確認 | exact iPhone/SKU未選定。Apple表は国/regionごとにnanoSIM/eSIM構成が異なる。[Apple SIM/eSIM model list](https://support.apple.com/en-euro/118569) |
| iPad | Wi‑Fi-onlyは携帯eSIMなし。Wi‑Fi+Cellularのモデル・regionとcarrier planを照合する | iPadOS client。native OS置換なし | 大画面/touch/外付けkeyboardの入力adapter。local modelはexact modelとmemory/storage測定後に有効化 | exact iPad SKU未選定。Appleのモデル別判定と利用者によるcarrier activation/QR手順が必要。[Apple iPad eSIM setup](https://support.apple.com/ja-jp/119592) |
| PC／laptop | WWAN modem／eUICC搭載とOEM firmware・OS activation APIの組合せをSKUごとに確認。Wi‑FiだけのPCをeSIM対応と扱わない | DSP/BSP・secure boot・recoveryが合格すればnative OS、その他は既存OS clientまたはcloud | CPU/GPU/RAM/storage・電源/冷却・keyboard/pointer/display解像度を実測し、local model profileを選ぶ。低能力時はcloud delegate | support SKUなし。WWAN module・eSIM provisioning・driver/firmware license・restore証拠が未取得 |
| 専用端末／IoT | soldered eUICCとprofile provision API、carrier whitelist、地域/電波認証をSKUごとに照合。スマホ向け旅行bundleを流用しない | 専用DSPまたは許可されたclient agent。hardware key、suspend/wake、更新・回復を一体受入 | CPU/RAM/flash/secure element/電力・sensor/input/outputを用途ごとに測る。local small modelまたはcloud jobを電源/通信条件で選択 | supported targetなし。eSIM Go Travel APIはIoT deviceの利用を許可しないため、専用IoT/provider契約が必要。[eSIM Go use restrictions](https://docs.esim-go.com/guides/getting_started/) |
| game console／GTA | eSIM・WWAN搭載は前提にしない。スマホ/PCのclientまたは別gatewayを使う場合も、その通信経路の本人・job境界を確認 | RockstarOSをconsoleへ上書きせず、公開・契約済みinterfaceの外部agent/SDKから接続 | controller/gamepad、TV/console resource、game API権限を個別確認。通常操作、game外AI、asset導入、game内agent/NPC、経済を別capabilityにする | 対象title/version/platform/public interface未特定。GTA adapterやゲーム内部状態接続は未受入 |

これは全機種対応宣言ではなく、対応判定に必要な入力と代表targetを固定した表。manufacturer specsはeSIMの物理/地域モデルと公称資源の根拠にだけ使い、provider実接続・OS takeover・端末内AIの実行証拠へ転用しない。新しい機種はexact SKU, OS/build, CPU/RAM/storage, modem/eUICC/MEP, bands/carrier lock, display/input/accessibility, install permissions, thermal/power, local model capacityを別途記録する。

## 次に進める順番

1. 完了: 実端末からPixel 10、GL066、frankel、locked／yellow boot状態を読取り専用で確認した。
2. 進行中: source、kernel、partition、AVB、Operator公開設定、復旧／vendor／署名手順の検査入口は固定済み。本人がGoogle利用条件を確認後、frankel用factory imageと対応full OTAをrepo外へ取得して検査し、full source上でadevtoolを実行して実inventoryを固定する。本番Operator公開値とHSM／署名bridgeは別gateとして残す。
3. Ubuntu 24.04 x86_64の十分なbuild環境でfull source取得、vendor生成、Soong buildを行う。
4. Sky／Wallet／Game接続層をAndroidへ移植し、UID、SELinux、暗号化、電源制約を受け入れる。
5. production署名、flash、boot、hardware、CTS/VTS、OTA/rollback、純正復旧を同じ端末・buildで検証する。
6. 完了: test署名のLocal AI service／APK、GGUF、airplane mode、Tool結合、熱・RAM・30分超を追加受入した。最終imageではproduction署名とSELinux enforcing条件で再受入する。

## 完了条件

- exact model/SKUとbuild fingerprintが証拠に固定される。
- QEMUやemulatorの成功を実機へ転用しない。
- Local AIの変更系Toolは本人確認なしに実行しない。
- debug署名、未審査weight、任意root/shellを製品へ含めない。

## 関連資料

- [AIネイティブOS詳細設計とapp／OS能力差](../ai-native-os-architecture.md)
- [LLM・評価モデル設計（local planner / Sky OpenAI / Jev）](../llm-evaluation-architecture.md)
- [Device support architecture](../device-support-architecture.md)
- [Phone preview](../phone-preview-20260911.md)
- [Android trial](../android-trial.md)
- [Local AI integration](../local-ai-os-integration-20260915.md)
- [Platform Core](../platform-core.md)
- [Android backup recovery](../android-backup-recovery.md)
- [Android production architecture](../android-production-architecture.md)
- [Device matrix](../../data/device-support-matrix.json)
- [Android release audit](../../data/android-physical-release-audit.json)

## 検証

- `npm run device-support:check`
- `python3 -m unittest tests/test_prepare_phone_build.py tests/test_stage_local_ai_apk.py tests/test_freeze_phone_build_inputs.py`
- `gradle -p android :core:test :shell-api:assembleDebug :automation:assembleDebug :shell:assembleDebug :article-tool:assembleDebug :automation:lintDebug :shell:lintDebug :article-tool:lintDebug --no-daemon`
- 同一debug signerのLocal AI／Broker／Tool／Shellを導入したAndroid 15 emulatorでBroker 11 non-skipped testとShell 5 testを実行し、モデルなし0件停止、schema migration、選択復元、不正token拒否、phrase確認、v2 export、新Keystore再bindingを確認する。stock Pixelはseed後に実再起動し、別processのrecover phaseでlease回収、2 Tool、結果、7履歴eventまで確認する。物理wipe復元は純正復旧artifactを揃えた別の管理試験にする。従来のplan受入は[証拠](../evidence/android-local-ai-plan-v2-20260916.json)、backup emulator受入は[証拠](../evidence/android-backup-v2-emulator-20260916.json)。
- 対象端末のflash／boot／OTA／rollback／stock recovery受入

## Pixel内の登録不要テストモード（OS10 / 2026-10-09）

目的・体験: 利用者の「ピクセルに入ってんの」「テストでなんでもできる状態にして」を受け、既存ShellのHome先頭にテストモードを置く。別ブラウザではなくnative Activityで17項目のサンプル一括、機能選択、入力変更、実行、出力、コピー、SAF保存、リセットを提供する。8実処理・9模擬の別と未実施の範囲を各結果に埋め込む。出典整理・無料記事は既存ArticleToolsを再利用。CSVは上限付きのUTF-8簡易変換で、Webの文字コード/納品契約の全移植ではない。

責任・入力出力: ROCKのOutputTestToolsはpure Javaで固定17 IDのみ。入力/補足は各12,000文字。出力はテキスト、全結果exportはrockstaros-native-output-tests/1 JSON。model応答・録音・HTTP取得の模擬結果は推論/取得成功と表示しない。ShellConnection・DB・Providerを呼ばず、ShellのINTERNET権限なしを維持する。TestModeActivityはexported=false、明示したHome入口から起動する。通常Brokerの本人性・予算・同意・仕事状態を変更しない。Zema表示例は本番workflowではなくfixtureとし、正式な仕事を作らない。

状態・保存・復旧: idle→running→output/error。入力編集で旧出力を破棄し、入力不正は当該項目だけ失敗、一括は他項目を続行。重複クリックをbusyで抑止。画面メモリだけで保持、閉じると破棄。回転はretained instanceで入力を保持、実行中断は再試行する。自動保存・backupへの組込なし。本人がコピーまたはDocument Pickerで保存先を選んだ場合だけ端末へ出力する。保存失敗はメッセージとコピーの代替を提示。登録・課金・送金・外部公開なし。

配布・承認・合格: 接続Pixel 10 GL066/frankelのAPK署名一致と更新前hashを確認し、adb install -rで非破壊更新する。旧APKをGit外へ保持。Core単体、Article parity、SDK/APK/lint、OS/design/verify、同一APK実機4新規試験と既存7試験、Broker件数・選択の不変、候補/実機hash一致を別々に記録。OS flash・初期化・正式OS受入へ換算しない。

実機受入: 同一署名のShell APKを非破壊更新し、実機hash 9cdb428de6a144fc7a47ed0244dc81e62b4386b78d8976db38e942eeb9e2b1d4を照合。Core116・SDK7・parity36・build/lint・実機11/11・全体verify exit0が合格。17結果とexport JSON内容、入力編集、clipboard、reset、Homeからnative起動、Broker件数/選択の不変を確認。SAF保存先を実際に選んだファイル書込は未検証。生画像・ログはGit外、要約は下記証拠へ保存。

未決定: 本物のcloud AIにはOWNERの接続先・鍵・利用枠、local AIには署名済みmodelの選定・導入受入、外部ToolにはProvider環境が必要。模擬結果を本番許可やTool成功へ昇格しない。次段階は対象を特定した実接続受入。証拠はdocs/evidence/pixel-native-testing.json。


## PixelとWebの共通画面へ接続する（2026-10-22 / OS10・SKY21・ROCK）

主担当Android / Device / Local AI、ROCK。共通画面は既存ブラウザのavoado.si、端末実行は既存mTLS/Linux manager・Eve account grantを再利用する。debug限定の最長30分foreground同期を追加し、旧native画面は端末設定として保持。release/no-network、認証・保存・停止・費用境界は変更しない。[詳細と受入](../rockstaros-complete-design.md#pixel-common-ui-host)。host stage8/8・Android build/単体20/20/lint合格。同署名実機の保存/同期/停止/正規画面は次のgate。


## Pixel Linux共通executorの開発（CORE03 / OS10・SKY21・DSP01 / ROCK）

[11項目の契約](../rockstaros-complete-design.md#pixel-portable-executor)と[証拠](../evidence/pixel-portable-executor.json)。既存manager/worker/停止/保存と共通kernel/journal/Eve replica/historyを接続。GGUF/担当pin、同job/thread、token/deadline、実worker ABI交渉、再読/競合/abort/遅着拒否、一時prompt回収を実装。HTTPに新実行actionは追加しない。合成manager/workerと実SQLiteの集中試験、SDK standalone、Pixel11-file packageはhost受入。本人解除、Android→mTLS→共通port、同一実機/候補、RAM/egress/常駐はJOINT/OWNERの未受入。検証は`node --experimental-strip-types --test tests/pixel-portable-executor.test.mjs tests/sky-linux-local.test.mjs`、`npm --prefix packages/rockstaros-runtime test`、`node scripts/build-sky-linux-pixel.mjs /absolute/private/candidate`、`npm run verify`。公開Source/端末/料金は変更しない。

限定結果: 集中21中20pass/1Linux-only skip、SDK59/59、最終full verify exit0（Node1389pass/1skip、API2029/CSV113、assets212欠損0）。SDK/Pixel候補の同byte hashを証拠へ固定。native mTLS/実Pixel/実CPU実効は未受入、既存26jobs/2models/6agentsの実データは今回読み書きしない。


## Pixel共通実行private transport（CORE03/05/07 / OS10・SKY21・DSP01 / ROCK）

[契約](../rockstaros-complete-design.md#pixel-runtime-private-transport)、[証拠](../evidence/pixel-runtime-private-transport.json)。guest Unix socket→既存mTLS relayとNative wire検証候補を作る。scope/claim/digestを既存runへ保存し越境拒否、close/環境停止のreview成果消失競合を修正。ROCKはtransport/保全、JOINTは実Android TLS/AVF/背景/同一候補、OWNERはaccount/実機解除。検証はtests/pixel-runtime-bridge.test.mjs、pixel-portable-executor/sky-linux-local、test_stage_pixel_runtime_transport.py、候補shell build/JVM/lint、npm run verify。token/鍵のguest移転・新manifest権限・新DBなし。Native account controllerのcommon ABI、実機/公開/本番は別で進める。

## Native共通仕事のclaim保存（CORE03/05/07 / OS10・SKY21・DSP01 / ROCK）

[契約](../rockstaros-complete-design.md#pixel-native-claim-journal)、[証拠](../evidence/pixel-native-claim-journal.json)。claim前の暗号化保存、同job/claim/hash、CAS/UNKNOWN、write結果不明後の再読を実装する。ROCKはprivate store/型/停止、JOINTは同候補Android Keystore/AVF/背景受入、OWNERは既存account/実機解除。検証: `node --experimental-strip-types --test tests/pixel-native-claim-journal.test.mjs`、`python3 -m unittest discover -s tests -p test_stage_pixel_claim_journal.py`、別候補shell build/JVM/lint、`npm run verify`。factoryは既存keyのみで新鍵を作らず、release/bridgeは保持。Native controller/実grant/reportと実Pixelは次のgate。

## Native accountの共通仕事controller（CORE03/05/07 / OS10・SKY21・DSP01 / ROCK）

[契約](../rockstaros-complete-design.md#pixel-native-account-controller)、[証拠](../evidence/pixel-native-account-controller.json)。既存account/exclusion/foregroundからcommon presence/claim/authorizeとprivate Linux start/read、暗号化report/readback/ackへ接続。ROCKは固定account/device/token・UNKNOWN・保存・表示、JOINTは同候補の実HTTP/Android/AVF、OWNERは実機解除と必要な具体grant。`test_stage_pixel_account_controller.py`、`test_pixel_runtime_bridge_unicode.py`、既存UDS/executor回帰、Native JVM/build/lint、`npm run verify`で検証。JVM偽portの一周と実server/実Pixelの一周は別。新manifest権限/鍵/顧客DBは作らない。


## Nativeの実HTTPと保存済みAPKの実機同期（CORE03/05/07 / OS10・SKY21・DSP01 / ROCK）

[11項目契約](../rockstaros-complete-design.md#pixel-native-host-integration)、[host証拠](../evidence/pixel-native-host-integration.json)、[既存APK実機証拠](../evidence/pixel-common-ui-integration.json)。固定accountのpure Java HTTP clientをAndroidとJDK gateで共有し、実TLS/auth/SQLite/UDS/manager、report応答喪失、JVM強制終了と再開、本文なし401のscope停止を検証。childは合成で実LLMではない。既存APK24b443c0の実Pixelは16:57 UTCに既存26jobs/2models/6agents/6replicasとforeground同期を確認、試験APK復旧/メイン不変/同期service停止を読戻した。新Native候補の実機合格とは別。ROCKは実装・保存・停止、JOINTは同候補Android TLS/Keystore/AVF、OWNERは必要な具体grant/解除。新しい権限・鍵・公開・課金なし。

検証: `node --experimental-strip-types scripts/check-pixel-native-host.mjs --java-home /path/to/reviewed-jdk --json-jar /path/to/reviewed-json.jar --proof /private/tmp/native-host-proof.json`、`node --experimental-strip-types --test tests/native-host-fixture.test.mjs`、stage Python suite、別候補Native build/JVM/lint、`npm run verify`。host gateはJDK/json.jarを明示し、不在をskip成功にしない。次は公開Sourceのsession/device binding、同候補Pixelの実通信と実推論・保存・再起動/停止を受入。ローカルlogout前後・鍵利用不可時の即時停止と恒常backgroundも未完。


## Pixel guest更新の保全・復旧（CORE03/05/07 / OS10・DSP01・SKY21 / ROCK）

既存updaterのapp直接上書き/relay未更新を、stopped限定・独立SHA固定・private stage/receipt・固定service・capability確認・旧code復旧へ変更。[11項目契約](../rockstaros-complete-design.md#pixel-guest-update)、[証拠](../evidence/pixel-guest-update.json)。Root18 filesystem/合成service、manager/guard/UDS、JDK Native HTTP、package build/hash、npm run verifyで検証。実guest/Android/同jobと既存data/鍵保全はJOINT、導入/grantはOWNER。signed public installer/同UID分離/電源断全復元は別。次は同sourceの実Pixel更新→Native→Web明示1仕事→保存/再起動/停止。料金/鍵/OS flashは変更しない。

2026-10-22実機追加: 同一guest manifest43296102/updater6fd231f1とNative308e候補を既存鍵/データ保持で更新。26jobs/2models/6agents、実HTTPS/mTLS/ABI、既存6replica/履歴のforeground同期・停止を受入。初回ABI test frame欠落を保存し、厳密検証を維持してテストを修正。新しい共通仕事の実推論/再起動/停止とAndroid journal書込は未受入。Web本人ログイン待ちを偽owner sessionやdevice-token POSTで代行しない。[同一証拠](../evidence/pixel-guest-update.json)。

## Pixel旧同期・共通runtimeの接続観測共存（CORE02/03/05/07 / OS10・DSP01・SKY21 / ROCK）

旧共用presenceの両方向上書きを実SQLiteで再現。既存D1へ用途別eve_runtime_presenceとowner/device/purpose AADを追加し、Root0083/Source main・mirror0032を別系列で適用する。旧DB/暗号文/仕事/履歴を保持、次の認証済み観測を待ち、新grantを作らない。[11項目契約](../rockstaros-complete-design.md#eve-presence-coexistence)、[証拠](../evidence/eve-presence-coexistence.json)。Root25/25・Source7/7、実Worker/Source全体/公開と実Native準備を続ける。Source未配備を実機完成へ換算しない。検証: tests/eve-presence-coexistence.test.mjs、eve-runtime/device-sync、Node SDK/Native host、Source test:api/full verify、npm run verify。

- OS10/DSP01/SKY21: [永続停止要求・容量予約](../rockstaros-complete-design.md#pixel-durable-stops)。局所21/JVM13/stager2受入、未配布・実機未受入。


### OS10/DSP01/SKY21：Eve本人停止のWeb公開と実機の次gate

2026-10-23 UTC、本人承認済み12ファイルを最新v114 Source9c4へ適応し、Source ac24bc0d・v115を既存avoado.siへ保存/公開、succeededと既存owner成果保持を読戻し。Source full2523pass/1skip/0fail、Native71/lint/build、Java/TLS/SQLite/private guest1/1、同候補の合成UIを別々に記録。Root full exit0は他担当17入力の途中変更を伴い、固定Root全体受入にしない。実機27仕事/2モデル/6担当/鍵を新しい保全基準にし、stoppedでpin済みguest更新→同署名Native→本人Webの停止→durable exact-tuple receipt→再開/再読込を次に受入。要求保存やstop_absentを実停止完了へ換算しない。[証拠](../evidence/pixel-durable-stops.json)。


2026-10-23本人停止の実機追加受入: 同じSource ac24/v115→guest229b/Native13fを使い、本人Webから実job1f51c47dを1回だけ発注→Eve停止→durable exact-tuple確認→アプリプロセス再起動後の2回目読戻しまで合格。元27仕事/2モデル/6担当/Android鍵を保持、総28件で再実行なし、元test d21・設定15を維持。実機6試験合格、必須acceptedフラグを欠いた試験の初回失敗も記録。OS/AVF再起動・logout/key-loss/lock/遅着start/UNKNOWN全体は未受入。確認済みcardとpending通知文の同期、quota maintenanceを次候補へ。[同一証拠](../evidence/pixel-durable-stops.json)。


Eve担当登録private portの実装と残gateは[OS契約](../rockstaros-complete-design.md#eve-agent-preparation-port)と[証拠](../evidence/eve-agent-preparation.json)。既存account queue/native処理・同一候補の実機一周は未受入。


### Eve担当登録のaccount配送（2026-10-23）

OS10／SKY21／CORE03、ROCK。既存暗号化キューへ登録namespaceを接続、owner/Origin/device/hash/claim/取消/読戻しを検証。詳細は[共通OS契約](../rockstaros-complete-design.md#eve-agent-preparation-queue)、[証拠](../evidence/eve-agent-preparation-queue.json)。native controllerと新規作成UI、実音声は未受入。


### Eve担当登録のnative同期候補（2026-10-23）

OS10/SKY21/CORE03、ROCK。既存runtime/停止優先、idle時のみ登録→fresh presence→ackを接続。隔離APK77unit/lint/build・同一署名、guest11ファイル整合成功。元候補/鍵/モデル保全、未導入。正本は[共通契約](../rockstaros-complete-design.md#eve-native-agent-preparation)、[証拠](../evidence/eve-native-agent-preparation.json)。Pixel接続0台のため本人へ接続を依頼中。作成UI/登録途中復旧/実音声/実保存/実停止は未受入。


### 目的からの担当作成・既存Web入口（2026-10-23）

OS10/SKY21/CORE03/WEB04。ROCK。新しい目的から個人担当を確認/保存し、既存登録queueと共通runtimeへ渡すUIを接続。最初の担当と応答喪失/登録中停止を含むhost29件成功。実ブラウザ/Pixel未受入、正本[契約](../rockstaros-complete-design.md#eve-purpose-agent-creation)・[証拠](../evidence/eve-purpose-agent-creation.json)。新たな公開なし。


### 目的別担当：Worker/native wire（2026-10-23）

OS10/SKY21/CORE03/WEB04、ROCK。既存Worker/D1/device auth/個人Libraryと実native Java HTTP/TLS/private bridgeで131項目成功。旧native停止/再起動も実行。合成モデル出力、実機/実ブラウザ/実モデルは未受入。正本[契約](../rockstaros-complete-design.md#eve-purpose-worker-wire)、[証拠](../evidence/eve-purpose-worker-wire.json)。再現は`node --experimental-strip-types scripts/check-eve-purpose-worker.mjs --java-home /path/to/jdk17 --json-jar /path/to/json-20250107.jar`。


### 担当登録期限後の照合（2026-10-23）

OS10/SKY21/CORE03/WEB04。期限切れclaimedを読戻しへ渡し、同じ担当ありはackのみ、未確認はunknown保存で再登録しない。host27・隔離APK78unit/lint/build成功。実2分wireと実機は別gate。[契約](../rockstaros-complete-design.md#eve-expired-agent-preparation)、[証拠](../evidence/eve-expired-agent-preparation.json)。

期限後登録の接続受入追記：実際の2分期限を待つ`--expiry`/`--expiry-missing`が各138項目成功。同一IDの登録済み読戻し／未確認保存を確認し、再登録なし。実Worker/D1・JDK HTTPS・private bridge・合成出力の範囲で、実モデル/Android/Pixel/公開の合格にはしない。証拠は`docs/evidence/eve-expired-agent-preparation.json`。

未到着startの停止：既存queueで負の停止記録を保存し遅延配送を防ぐ。ROCK対象40/40、実機は未受入。正本はOS設計#eve-missing-start-stop、証拠docs/evidence/eve-missing-start-stop.json。

端末成果の持出しは保存直前の本人/exact仕事/revision/hashを照合する。対象14/14、実ファイル受入は接続後。正本OS設計#eve-runtime-draft-export、証拠docs/evidence/eve-runtime-draft-export.json。

Eve共通実行の隔離Source統合：OS10/O6、Source集中35/35、full実行中。RootとSourceの移行/Agent型の相違を保持。公開なし。証拠docs/evidence/eve-common-runtime-source.json。

既存qwen3:4bのSource評価：初回1問目provider_failed/partial、usage null、品質未測定。失敗保存/再起動/同ID再送追加推論0/選定拒否を確認。直接16token診断は応答200だがlength終了で要求不達。新モデル取得/Cloud/実機なし。証拠docs/evidence/eve-real-model-source-worker.json。

同suite3のqwen2.5実測は形式3/3・内容55.56で不採用。同job/threadの明示的固定Toolを実行しURL保持検査/完了/再起動保持、追加推論0を確認。LLM計画合格と区別。証拠docs/evidence/eve-model-rejection-fixed-tool.json。

実Sourceの限定受入追記：明示選択の既存qwen2.5:1.5bによる1回の計画生成をserverで検証し、採用前Tool0、採用後mr-citations/compose-check/URL保持検査/同job完了・会話保存・Worker再起動一致、同推論再送409を確認。入力471/出力191報告、model digest前後一致。一般planning評価の不合格と自動採用禁止は維持。実UI/Pixel/汎用計画/意味真偽/公開/課金を含まない。証拠docs/evidence/eve-real-planner-source-worker.json。

Source固定buildの追加受入：実Toolの出力上限失敗から冗長mergeのみ1回修正し、合格artifact hash/完成条件/予算を保持。必須文言未達は修正/完了を拒否して停止を保存。Worker3回再起動一致、LLM0。また実ローカルmodelの応答完了後・Worker配送前に同jobを取消し、遅着候補/Tool実行を拒否、報告usageのみ保存、再起動後取消保持。同試行再送409。Provider推論中断や物理停止の証拠にはしない。証拠docs/evidence/eve-repair-source-worker.jsonとeve-real-planner-source-worker.jsonのlateResponseStop。

Pixel実機更新の限定受入：Pixel10/GL066/frankel、既存APK13f06113…から同一debug signerのcf552350…へinstall -r。実機APK読戻しとaccount暗号文/prefs/stop handles/claim journal集約hashの前後一致を確認。Linux/model/OS/鍵を変更せず、Keystore復号・新guest登録・実音声/実UI/本番OSの成功にはしない。画面接続native pipe不通、本人へ既存Linux/同期開始を依頼。証拠docs/evidence/eve-native-agent-preparation-pixel.json。


### Pixel接続・保存済みAIの準備改善（2026-11-02）

2026-11-02実機追記: Terminalは通常UIを開けるがguest VMが約4秒周期で再起動する。画面表示操作のANRはmain threadのwaitDisplayService待ちまで特定。端末再起動・software描画では改善せず元GPUへ復帰、Terminalは閉じてprocess0。既存Android接続6ファイル一致、Linuxデータの最終比較は未完了。backup存在表示を内容保全の証拠に置き換えず、reset/restore/deleteを進めない。要約は既存evidenceのphysical.terminalDiagnosis、raw ANR/ログはGit外。 同日05:12以降はroot_part不在→未インストール案内へ変化（正確な契機未確定）。一時診断flag/空directory/診断APKは除去。最終Android接続6/6不変、Eveは接続確認要求、Linux内保全とguest root causeは未確認。現在の残件はphysical.terminalRecoveryAttemptを参照し、reset/restore/reinstallを診断の代わりに実行しない。

追加の因果照合では、本人の更新ボタン押下、05:12:09.914のUpgradeActivity発LauncherActivity、導入APKのuninstallAndBackup成功後のみrestartTerminalへ進むDEXが一致。root_part→root_part_backup（REPLACE_EXISTING）とmarker削除が直接原因で、先の「契機未確定」は履歴へ移る。旧backup内容の保全は未確認。USB標準backupは対象外（47byte/空tar）、実機Seedvaultは未設定・3GiB上限、直前root論理104GiB、vm listは空。権限緩和や初期化/復元で代替しない。正規system署名の読み取り専用exportが得られた場合も、原本をO_RDONLYで開く→新規出力へsparseを保持して退避→原本/コピーhashと一覧を照合→コピーだけをro,noloadで検査、を合格条件にする。元の34仕事/2モデル/10担当・鍵の比較が通るまではEve再接続合格にしない。

OS10/DSP01/WEB04・JOINT。本人が列挙した8課題への修正。目的は既存登録・モデル・仕事を保持した再接続と、Eveで選ぶ担当のモデル準備。入力は既存account/Keystore/bridgeと照合したmodel ID/hash、出力は既存cache-only状態と同期。モデル/仕事/接続を追加しない。

アプリ独自の30分停止を除去し、Android dataSync timeoutのstopSelfとロック中保留を維持。同期停止後は実際のpoll終了を待ち、照合・準備の送出直前にもidle/account/lock/pending-stopを再検査。選択は5分間の既存inventory/session/hashへ束縛し、期限切れは再照合。担当名とモデルを併記し、準備後は同じrequest IDを自動照会、ready時だけ画面前面から同期再開を依頼する。ready heartbeatの30秒は変更しない。

失敗はlock/同期処理中/停止未確認/account通信/Linux bridgeを区別し、秘密値や生例外は表示しない。結果不明は再prepareせず同じ操作を照会する。Terminalは別アプリのVMで、終了時の停止をAPKで回避せず起動入口とアプリ切替案内を提供する。既存の通常/PC試用realmを保持し、新しい鍵/権限/ダウンロード/推論は作らない。

ROCKはUI・同期とguard、EXTERNALはAndroid/Terminal lifecycle、JOINTは同署名APKと実機保全、OWNERは担当/モデル選択。合格条件はhostの遅延選択・expiry/lock/account/stop/同期競合拒否、Android build/unit/lint、実機34仕事/2モデル/10担当と接続hash一致、準備→同期→Eve準備済み。実機の未実行をhost成功で代用しない。状態と残条件はdocs/evidence/pixel-connection-usability.json。 Terminalの起動補助は通常のアイコンと同じMAIN/LAUNCHERを別taskで開く。実機でTerminal自身の画面例外と起動拒否を確認したため、復元・再インストールは進めず、既存Linux/backupの保全と復帰を未完了として追跡する。
