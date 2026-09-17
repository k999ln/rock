# avocadoOS — AIネイティブOS開発の再開指示

2026-09-16更新の現在入口。`AGENTS.md`、`data/project-status.json`、`docs/product-baseline.md`、`docs/ai-native-os-architecture.md`、`docs/ai-native-os-design-audit.md`を読んで、未完了作業を進める。製品中核は高性能で交換可能なローカルLLMとoffline agentを持つOS。Sky／Zema、便利機能、Game／IP／動画／VRはこの共通Coreへ接続する。設計はAstra、監査はSolという利用者指定を保持する。

作業対象のmainと関連branch、該当HEADのCIを必要範囲で確認する。`docs/current-state-20260911.md`、過去のPR #4／#7やlaunch-candidateに関する記述は履歴を含むため、現在のGitと証拠に照合する。取得できなかったCIを成功と表示しない。正本はこのrepositoryの現在のmain。

過去の基準入力はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、当初設計snapshot `de5b102d3525daccf604efd5685bdf8c14ad5d50`。設計v1.1承認は`27b34adc02a9e06a4816aa18a5e38cf38b330953`。これらの古い版へ作業を巻き戻さない。

## 優先する作業

1. 詳細設計の最初の実装単位を進める。現Android Engineは固定2工程の純粋変換、Local AIは固定package／APIのため、汎用モデル交換・共通記憶・外部作用・多端末調停を実装済みとしない。契約を既存job／SQLite／Brokerへ追加し、受入範囲を分ける。
2. 最初の端末はPixel 10／GL066／frankelで確定。試験署名の単体APKは非破壊再起動を含む23/23合格。`docs/evidence/android-pixel-10-prefull-physical-20260916.json`の証明範囲を使い、既存合格を繰り返すための作業を最優先に戻さない。
3. full build準備は`docs/phone-preview-20260911.md`と初回flash gateへ従う。本人のGoogle利用条件確認、factory／full OTA実ファイル、vendor生成、HSM／署名bridge、本番Operator登録、物理data／Keystore全損復元が残る。準備済み検査器と実入力の取得を混同しない。有料環境と全OS buildは条件が揃った段階で実施する。
4. Sky app／OSの能力差を明示し、最初の実用Toolと非金融Game／IP fixtureで共通契約を検証する。Gameの制作・体験をファンドや実収益の完成待ちにしない。外部ゲームや生成Providerへ接続する部分は個別adapterと個別受入を持つ。
5. OS Core、収益Provider、Wallet／Fund、Game、QEMU配布は独立した受入対象として管理する。OS full build／flashと一般公開は現行gateへ従い、単体APKや合成receiptだけで完了表示しない。

新Siteは本人限定で公開済み。元SiteのNOT_FOUNDは元DB未復元とともに保持し、新Siteを再作成しない。ログイン後の本番Hub操作は未確認。Gitのpushだけで新しいsourceがSitesへ配信されたと記録しない。

## 維持する製品契約と証拠

RQ01〜RQ48、`docs/rockstaros-1.0-strategy.md`の8原則、AIネイティブOS Core、Sky／Zema、ToBの商品供給、Game交換／作者SDKを維持する。検証済み収益から月最大888 USD cents／同一契約の複数端末重複防止、Rock ATM手数料0、未定のゲーム料金と実資金条件は変更しない。Core受入は応用の個別公開gateを廃止しない。

b7/rc2の凍結配布と限定受入を保管する。旧9ab、b7/rc2、最新ソース、標準Androidエミュレーター、スマホ実機、本番金融を分けて報告する。既存imageへ新ソースの合格を付け替えない。

新規テストは「削除すると見逃す現実的な不具合」が説明できるものに絞り、既存との重複や実装コピーを避ける。変更箇所の試験、`npm run verify`、必要なAndroid／native検証、該当SHAのCIを確認する。未実行・skip・条件不足をPASSにしない。

通常の実装・検証・作業branch保存は承認済み。main merge・一般公開・外部告知・課金契約・端末初期化／書込み・本番鍵・実資金については、過去の意思表明と具体的な準備／承認を区別する。承認済み作業を再質問して止めず、条件の揃った範囲を進める。

変更した現在入口と機械可読状態を揃え、`npm run project:update`でREADME／projectを同期してから保存する。完了範囲、残る条件、次の具体的な操作を簡潔に残す。
