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

ただし、**全体が一つの製品として稼働済みという意味ではない**。native Skyの選択をBroker SQLiteへ永続化し、保存済みtokenだけをZema／Local AI API v2／最初の選択Toolへ渡すsourceとemulator試験は合格した。従来のPixelでは厳格plan、2段階Tool実行、結果、履歴、本人確認待ちまで完走済みである。一方、新経路の物理再起動／失敗復旧、Wallet・外部Provider、AOSP imageは未完了である。本番準備完了、収益や利回り、実機OS完成は主張しない。

## 組合せの判定

| 層 | 選択 | 設計適合 | 実際の到達点 |
| --- | --- | --- | --- |
| 製品体験 | Skyで選びZemaで全仕事を扱う。CSVはSky Tool | 適合 | native Sky選択のBroker永続化とZema token結合はemulator合格。物理再起動受入待ち |
| 端末 | 共通Core＋SKU別DSP、Pixel 10 GL066が最初 | 適合 | 対象確定、full build／flash未実施 |
| 権限 | ShellとBrokerを分離し最小権限化 | 適合 | 単体build・emulator・stock Pixelの成功／fail-closed Binder試験合格、AOSP enforcing未実施 |
| LLM | offlineで交換可能なGGUF runtime | 適合 | Pixel単体APKとplan-only API v2合格、OS image未搭載 |
| Tool | 署名・版・権限・receipt付きpackage | 適合 | 最初の選択ToolはPixelでplan→2 Tool→結果・履歴まで合格。汎用registryは未完成 |
| 収益 | Provider署名後だけWalletへ反映 | 適合 | Rock所有fixture合格、外部sandbox未接続 |
| Wallet／Fund | Provider交換可能、検証済み実績だけ利用 | 適合 | Walletはcode／sandbox、FundはPAPER |
| 緊急保護 | OS外Dock＋制限付き端末Agent | 適合 | Dock側実装、Agent／実機訓練未完了 |
| 更新／復旧 | 分離署名、A/B、rollback index、純正復旧、暗号化backup | 適合 | policy・source途中、物理受入未完了 |
| Game | 同じ権限・receipt・Walletの任意adapter | 適合 | Linux fixture／SDKのみ、実ゲーム未接続 |

## 1.0の未接続点

最重要の不足は、実行中の`native Sky → Zema → Broker → Local AI → 選択Tool`を所有Pixelの実再起動で中断し、同じ選択・仕事・履歴から安全に再開できることを二段階試験で確定すること。source、DB migration、emulatorの再open／不正token拒否までは合格した。続いてbackup v2の復元・本人再結合、production署名と純正復旧入力、端末側Operator Agentが残る。

収益については、`Tool結果 → 外部Provider → 署名済みEarning Receipt → Wallet照合`のうちRock所有fixtureまでは通っている。外部Provider sandbox、返金・chargeback・結果不明、owner署名と最初の管理されたtransferは未完了である。ファンドはこの実績が複数回たまるまでPAPERのままにし、ゲームは1.0中核loopを止めない。

## 進める順番

1. 接続を戻したstock Pixelで、実行中のnative Sky選択仕事を実再起動し、lease回収・再開・結果・履歴を確認する。
2. backup v2復元、owner再結合、clone拒否を完了する。
3. 純正復旧artifact、vendor inventory、production署名入力を固定する。
4. 制限付きOperator Agentと監査経路を実機訓練する。
5. 事前gateが全合格してから最初のAOSP full buildを行う。
6. flash後にSELinux enforcing、CTS/VTS、OTA、rollback、純正復旧、電池・熱を受け入れる。
7. 外部収益Provider一本をsandboxでWalletまで通す。
8. 反復実績ができてからFundを進め、Gameはその後の任意拡張にする。

`npm run system:composition:check`は、判定の過大表示、必須層・必須flow・証拠の欠落、誤ったproduction完了表示を失敗させる。
