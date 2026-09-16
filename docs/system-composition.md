# avocadoOS 全体構成監査

この文書は、各機能が存在するかだけでなく、製品目的に合う選択になっているか、相互に接続済みか、同じ環境で受入済みかを分けて判定する。機械可読の正本は [`data/system-composition-audit.json`](../data/system-composition-audit.json) とする。

## 結論

現在選んでいる組合せは、1.0の目的に対する現時点の最適解として整合している。

- 共通Core＋機種別Device Support Package
- 最初の物理対象はPixel 10／GL066／`frankel`
- SkyはTool発見・接続、Zemaは仕事管理
- Android Shell、Platform Broker、Local AI、Tool、Provider、Operator Agentを権限分離
- LLMとToolは交換可能、権限・receipt・停止・復旧契約はOSに固定
- Tool完了、検証済み収益、Wallet反映、ファンド実績を別状態で管理
- 運営管理画面はOS外、ゲームは中核loop後の派生

ただし、**全体が一つの製品として稼働済みという意味ではない**。native ZemaからShell／Broker／Local AI／最初の選択Toolまでのsource接続と、Pixelで不正planを0件のまま止める試験までは通った。Pixelのモデル出力が厳格planを通り、Tool完了・結果・履歴・再起動復旧まで一本で完走する受入は未完了である。本番準備完了、収益や利回り、実機OS完成は主張しない。

## 組合せの判定

| 層 | 選択 | 設計適合 | 実際の到達点 |
| --- | --- | --- | --- |
| 製品体験 | Skyで選びZemaで全仕事を扱う。CSVはSky Tool | 適合 | Web統合、native Zema入口と最初のTool接続を実装。native Skyは未完成 |
| 端末 | 共通Core＋SKU別DSP、Pixel 10 GL066が最初 | 適合 | 対象確定、full build／flash未実施 |
| 権限 | ShellとBrokerを分離し最小権限化 | 適合 | 単体build・emulator・stock Pixelのfail-closed Binder試験合格、AOSP enforcing未実施 |
| LLM | offlineで交換可能なGGUF runtime | 適合 | Pixel単体APK合格、OS image未搭載 |
| Tool | 署名・版・権限・receipt付きpackage | 適合 | 最初の選択ToolへZema plan gate接続済み。Pixelの厳格plan合格と汎用registryは未完了 |
| 収益 | Provider署名後だけWalletへ反映 | 適合 | Rock所有fixture合格、外部sandbox未接続 |
| Wallet／Fund | Provider交換可能、検証済み実績だけ利用 | 適合 | Walletはcode／sandbox、FundはPAPER |
| 緊急保護 | OS外Dock＋制限付き端末Agent | 適合 | Dock側実装、Agent／実機訓練未完了 |
| 更新／復旧 | 分離署名、A/B、rollback index、純正復旧、暗号化backup | 適合 | policy・source途中、物理受入未完了 |
| Game | 同じ権限・receipt・Walletの任意adapter | 適合 | Linux fixture／SDKのみ、実ゲーム未接続 |

## 1.0の未接続点

最重要の不足は、PixelのLocal AIを計画専用出力へ合わせ、`native Sky → Zema → Android Shell → Broker → 選択Tool → 結果・履歴`を成功させて再起動・失敗復旧まで通すこと。現在はZemaからLocal AIまで到達し、不正planを仕事0件のまま止めるところまで実測済みである。次に、backup v2の復元・本人再結合、production署名と純正復旧入力、端末側Operator Agentが残る。

収益については、`Tool結果 → 外部Provider → 署名済みEarning Receipt → Wallet照合`のうちRock所有fixtureまでは通っている。外部Provider sandbox、返金・chargeback・結果不明、owner署名と最初の管理されたtransferは未完了である。ファンドはこの実績が複数回たまるまでPAPERのままにし、ゲームは1.0中核loopを止めない。

## 進める順番

1. stock PixelのLocal AIを計画専用契約へ合わせ、native Sky／Zemaから最初の選択Toolを成功完走し、結果・履歴・再起動復旧を確認する。
2. backup v2復元、owner再結合、clone拒否を完了する。
3. 純正復旧artifact、vendor inventory、production署名入力を固定する。
4. 制限付きOperator Agentと監査経路を実機訓練する。
5. 事前gateが全合格してから最初のAOSP full buildを行う。
6. flash後にSELinux enforcing、CTS/VTS、OTA、rollback、純正復旧、電池・熱を受け入れる。
7. 外部収益Provider一本をsandboxでWalletまで通す。
8. 反復実績ができてからFundを進め、Gameはその後の任意拡張にする。

`npm run system:composition:check`は、判定の過大表示、必須層・必須flow・証拠の欠落、誤ったproduction完了表示を失敗させる。
