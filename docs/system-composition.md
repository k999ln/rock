# avocadoOS 全体構成監査

この文書は、各機能が存在するかだけでなく、製品目的に合う選択になっているか、相互に接続済みか、同じ環境で受入済みかを分けて判定する。機械可読の正本は [`data/system-composition-audit.json`](../data/system-composition-audit.json) とする。

## 結論

現在選んでいる組合せは1.0の目的に整合する設計候補である。最適性や全経路の実装完了は未実証。詳細な層別責任、model/記憶/仕事/能力交渉、Coreと応用の受入は[AIネイティブOS共通設計](ai-native-os-architecture.md)を参照する。

製品の中心は、交換可能な高性能ローカルLLMとoffline agent runtimeを持つ **AIネイティブOS Core** を到達目標とする。現行は固定Qwen / llama.rn profileの試験署名Pixel APK実証であり、交換可能な複数profileやOS image搭載ではない。SkyとZemaはそのCoreを最初に実用化する第一者system、仕事・生活を便利にする自動化は継続的な製品開発系統、ゲーム・IP／動画・VRは関心に基づく優先的な応用系統とする。個別systemをOS imageへ密結合せず、共通の権限、仕事、Tool、receipt、更新・復旧契約で接続する。LLM、OpenAI、Jevの現在地は[LLM・評価モデル設計](llm-evaluation-architecture.md)と[`data/llm-capabilities.json`](../data/llm-capabilities.json)を正本にする。

- 共通Core＋機種別Device Support Package
- 最初の物理対象はPixel 10／GL066／`frankel`
- SkyはTool発見・接続、Zemaは仕事管理
- Android Shell、Platform Broker、Local AI、Tool、Provider、Operator Agentを権限分離
- LLMとToolは交換可能、権限・receipt・停止・復旧契約はOSに固定
- Tool完了、検証済み収益、Wallet反映、ファンド実績を別状態で管理
- 運営管理画面はOS外、ゲームは関心に基づく優先的な応用系統。ただし1.0のCore実証を止める必須依存にはしない

ただし、**全体が一つの製品として稼働済みという意味ではない**。native Sky選択のBroker永続化、Zema／Local AI API v2／固定Tool、合成Wallet、Shell、Operator検査、実再起動2段階は[所有GL066の試験署名APK 23項目](evidence/android-pixel-10-prefull-physical-20260916.json)で合格した。backupは非破壊exportまで。model/runtimeの汎用交換、長期記憶、外部変更Toolのoutbox、多端末Sky、GameのAndroid接続は未実装。鍵喪失復元、外部Provider、AOSP imageは未受入。本番準備完了、収益や利回り、実機OS完成は主張しない。

## 組合せの判定

| 層 | 選択 | 設計適合 | 実際の到達点 |
| --- | --- | --- | --- |
| 製品体験 | Skyで選びZemaで全仕事を扱う。CSVはSky Tool | 適合 | 固定Toolのnative Sky選択・Zema token結合・物理再起動は単体APK合格。一般化/多端末は未実装 |
| 端末 | 共通Core＋SKU別DSP、Pixel 10 GL066が最初 | 適合 | 対象確定、full build／flash未実施 |
| 権限 | ShellとBrokerを分離し最小権限化 | 適合 | 単体build・emulator・stock Pixelの成功／fail-closed Binder試験合格、AOSP enforcing未実施 |
| LLM | offlineで交換可能なmodel/runtimeを目指す | 適合 | 固定runtimeのPixel APKとplan-only API v2合格。汎用交換と比較性能評価は未実装、OS image未搭載 |
| remote evaluator | Skyから任意・明示同意でJevを利用し、結果を助言に限定 | 適合 | 設計と能力表のみ。route、SDK/API互換、credential、provider sandbox、privacy/料金受入は未実装 |
| Tool | 署名・版・権限・receipt付きpackage | 適合 | 最初の選択ToolはPixelでplan→2 Tool→結果・履歴まで合格。汎用registryは未完成 |
| 収益 | Provider署名後だけWalletへ反映 | 適合 | Rock所有fixture合格、外部sandbox未接続 |
| Wallet／Fund | Provider交換可能、検証済み実績だけ利用 | 適合 | Walletはcode／sandbox、FundはPAPER |
| 緊急保護 | OS外Dock＋制限付き端末Agent | 適合 | Dock/Agent実装とPixel試験署名5件合格。本番credential、StrongBox登録、Device Owner訓練未完了 |
| 更新／復旧 | 分離署名、A/B、rollback index、純正復旧、暗号化backup | 適合 | policy・source途中、物理受入未完了 |
| Game | 同じ仕事・権限・成果・receipt。資産交換時だけWallet | 適合 | Linux fixture／SDKの限定受入。Android実ゲーム/IP候補は未実装。Fund非依存の並行track |

## 1.0の未接続点

固定Tool経路の実再起動2段階は完了した。共通基盤の不足はmodel交換/互換計測、model非依存の記憶、外部作用の結果不明照合、Sky appとOSの能力交渉である。実機OS側は物理wipe復元、production WebAuthn／StrongBox登録、Device Owner／SELinux実機試験、production署名と純正復旧入力が残る。

収益については、`Tool結果 → 外部Provider → 署名済みEarning Receipt → Wallet照合`のうちRock所有fixtureまでは通っている。外部Provider sandbox、返金・chargeback・結果不明、owner署名と最初の管理されたtransferは未完了である。ファンドはこの実績が複数回たまるまでPAPERのままにし、ゲームは1.0中核loopを止めない。

## 進める順番

1. 完了済みの固定Tool実再起動を回帰基準にし、model互換/最小記憶/effect分類/能力交渉をapp-onlyで具体化する。便利Toolと非金融Game/IPのfixtureを並行して進める。
2. backup v2復元、owner再結合、clone拒否を完了する。
3. 純正復旧artifact、vendor inventory、production署名入力を固定する。
4. 制限付きOperator Agentと監査経路を実機訓練する。
5. 事前gateが全合格してから最初のAOSP full buildを行う。
6. flash後にSELinux enforcing、CTS/VTS、OTA、rollback、純正復旧、電池・熱を受け入れる。
7. 外部収益Provider一本をsandboxでWalletまで通す。
8. 反復実績からFund改善を受け入れる。Game/IPの制作・試遊は1から並行し、動画/VR/資産交換は各adapter固有の独立gateへ進める。

`npm run system:composition:check`は、判定の過大表示、必須層・必須flow・証拠の欠落、誤ったproduction完了表示を失敗させる。
