# Rock star OS — native OSの統合と現行方針

更新: 2026-09-09。製品・公開コードの正本は `k999ln/rock`。
この文書は、9月8日〜9日の利用者指示とLinux版の開発を、9月5日のAndroid P1計画へ追加する決定記録である。方針が違う箇所は本書を優先し、過去の実装・試験記録はその対象を限定して保持する。

## 1. 追加する製品方針

- 名称は **Rock star OS**。自動化を大量に固定搭載するのではなく、標準Hubから独立したTool・Workflow・Connectorを探し、取得・更新・停止・削除できるOSを作る。
- 最初の製品端末は **BlackBerryを優先**する。機種・variantは未定。解除可能なbootloader、BSP、画面・入力・通信・電源・復旧・更新を確認するまで、対応済み機種を宣言しない。
- 開発中のOS本体は **Linux / Buildroot / ARM64 QEMU virt**。kernel、root filesystem、init、専用UIDのサービス、C/Cairoのnative画面を持つ。WebサイトやAPKの起動をこのOSの起動と数えない。
- 既存のAndroid/AOSP試作は比較・移植候補として保持する。Pixelは9月5日時点の候補で、現在の初期製品端末の決定ではない。LinuxのQEMU成功をCuttlefish・Pixel・BlackBerryの成功へ読み替えない。実機のOS方式は適合調査後に固定する。
- 購入者が引き渡し済み端末を起動し、少ない操作でHubを使える体験を目指す。「タップで利用開始」と「ロックされた任意の端末へのOS書込み」は別工程。前者の仮想端末試作はあるが、後者を回避する新技術や実機成立を主張しない。
- 初期サービスとWalletは本人確認済み端末購入者のclosed方式。引き渡し時の確認を再利用し、入力を最小化する。ただし金融providerが必要とする確認を省略できると決めつけない。SDKで作成・ローカル検証する資格と、本番Walletを利用する資格を分ける。
- 標準Walletは自動化売上の入金・確定・利用可能残高・出金保留・月額を区別する。新OS契約は **月888 cents（8.88 USD）固定**。明示した継続課金同意に基づきbackendで月1回、同一契約の複数端末でも重複徴収しない。不足時は未払いとして処理し、試算利益や保留残高を使わない。
- ToBの収益受領は受付、確定、送金中、結果不明、照合済みを分ける。応答が失われたら同じキーで照会し、無条件で再送しない。MCP接続・解除と資金精算は別の状態管理で、切断しても成立済み取引やreceiptを消さない。
- AIは端末・PC・cloudから選択する設計。処理場所、送る入力、権限、上限費用を事前に示す。cloud停止時に既存の端末処理を継続できるようにし、未導入のAIモデルがofflineで動くと表示しない。
- 運営用ツールは利用者のHubとは別の権限面に置く。状態診断、停止、版・配信計画、署名・失効・復旧を扱い、任意root shellや利用者の秘密を読む共通入口にしない。
- 軽さと使いやすさは、操作数・待ち時間・復旧時間・資源使用を同条件で測る。特許や世界初は目標であり、先行技術調査・特許性判断や実測を終えたという表示にはしない。

## 2. コードと契約の配置

| 場所 | 役割 | 統合の境界 |
| --- | --- | --- |
| `systems/rock-star-os/` | 今回追加するLinux native OS、Hub、SDK、署名配布、Wallet・MCP試作、テスト | このディレクトリをLinux開発の作業rootとする |
| `android/`, `os/device/`, `os/source-lock.json` | 既存Android P1 / AOSP製品設定 | ファイルやAndroid APIをLinux版で上書きしない |
| `contracts/`, `lib/workflow.ts` | 既存記事Tool契約、Workの業務状態 | native実行結果と同一API・同一DBとはしない |
| `app/`, `lib/fund.ts`, `db/`, `drizzle/` | 既存Webの仕事・ファンド試算・保存 | 本番移行、残高移管、自動課金を今回の追加で起動しない |
| 非公開の運用component | 実アカウント、金融provider、顧客情報、運用receipt | 公開Gitへコピーしない |

AndroidのAIDL固定2操作・32 KiB契約と、Linuxの署名recipe・MCP契約は異なる。名前が同じことを互換性の証拠にしない。Linux側の `succeeded` は処理結果であり、Web側の `completed` は全工程と本人確認を終えたWorkである。変換adapterを作る場合はowner分離、revision、sample/失敗の非通過、最終確認、重複排除のfixture照合を先に通す。今回そのadapterやDB移行は追加していない。

旧Webファンドの「共通収益・費用から月最大8.88 USD相当」は**試算モデルとして維持**する。新OSの固定888 cents契約へこの上限式を流用しない。同じ契約へ両方を重ねて徴収する設計ではない。既存のEthereumアドレス接続は、購入者認証・本人確認・Wallet残高・送金同意の代替ではない。

## 3. 取り込む基準版と証拠の範囲

基準版は `MCP-runtime-20260909` の封印済みソースsnapshot。起点の開発Git HEADだけでは未commit差分を識別できないため、archiveと各導入ファイルのSHA-256を `systems/rock-star-os/IMPORT-MANIFEST.json` に記録する。公開不要な調査台帳、過去の大量ログ、実行状態は選別する。起動画像や個別端末用の設定をGitへ同梱しない。

| 確認 | 基準版で確認した範囲 | 残る条件 |
| --- | --- | --- |
| OS本体 | ARM64 QEMU、読み取り専用rootfsとデータ分離、native Hub、署名配布・更新、A/B復旧の限定試験 | BlackBerryの起動・driver・省電力・実電源断 |
| SDK / Hub | package作成・署名、互換・権限判定、取得・実行・更新・停止、担当を分離した内部Tool作成 | 外部開発者pilot、一般公開Store運用、実機だけでの完結 |
| MCP | owned fixtureへの接続、入力の送信確認、実行・結果保存・解除、backend/OS再起動後の状態保持 | 一般の外部MCP、OAuth、providerごとの相互運用、実ToB送金 |
| Wallet | 合成購入記録、資格・認証・同意・複数端末、固定月額、冪等性・残高不変条件のhost/guest試験 | 正式providerの本人確認、実売上、実送金・ATM |
| AI / PC | 処理先・許可・予算・fallbackの試作、限定transport | 実AIモデルの品質・性能、実USB輸送、device/cloud/PCの製品E2E |
| 運営・導入 | 状態管理・配信計画・失効・復旧の試作、仮想端末の有効化入口 | 本番配信executor、実端末の引き渡しと回復、運用pilot |

第9基準版のLinux試験は1003件成功と記録されている。MCPの実プロセス試験では結果不明からの照会復旧、副作用1回、MCPポート障害時のWallet継続を確認。native試験は22枚の画面とログで、接続→入力確認→実行→backend再起動→OS再起動→保存結果→解除を確認した。これらはowned fixture・仮想端末の証拠であり、実サービス・実資金・BlackBerry実機の合格ではない。

再起動後の旧記録には初期pending画面と、後の手動更新後のready画面がある。その間の画面がないため「手動更新が必須だった」とは断定しない。起動時の自動再読込と画面応答をさらに検査する変更は、基準版へ未検証のまま混ぜない。

主な封印済み証拠の識別子（元成果物との照合用。Gitへの画像再配布ではない）:

| 記録 | SHA-256 |
| --- | --- |
| 第9ソースarchive | `5187b50e558e5b121a1b7772cd4dc7fcc2ddb4b78382c7ad49a149930bca0ab3` |
| 第9成果物SHA256SUMS | `2f6dcced80308ea8a49c56ead88c55f965faa812f41891e360d0b9518825726c` |
| Linux 1003件のtest-summary | `d4532fb6516543bfc5b4f3696da2f5d0d11e8eb1c1e1ed0cc2410e3f8cf14f08` |
| MCP service-process report | `f2a0b062f6c70b21c4134db7bf4ff63ca42921f636e411becab067ea9b02cdfd` |
| MCP native report | `b19b6e4063e3ffb8bbe463959a927fcee28a284d9856ad9a6478a8ff28a6ee37` |

今回のRock配置で再実行した検証と未実行項目は [統合検証記録](native-os-validation.md) を参照する。過去の1003件という数字を、変更後のRock全体に無条件で付け替えない。

## 4. 継続する順番

1. 公開するソースの出所と秘密情報境界を固定し、既存Web/Androidとnativeの検証を別々に通す。
2. 起動画面の応答確認・自動再読込の未検証変更を、独立した試験付きで評価する。
3. BlackBerryの型番を選定し、boot・driver・更新・復旧の実現性を確定する。QEMU向けイメージを書き込まない。
4. 実機だけで、Hub検索→直接取得→許可→実行→更新→失敗復旧を通す。OS再buildなしの第三者Tool追加を実証する。
5. 実USB、許可した外部MCP/AI、金融provider sandbox、ToB精算、運営配信を各受入条件で接続する。

標準Walletと月額の設計は確定方針として進めるが、実資金の提供開始は別の承認・契約・試験を要する。端末、実USB、providerなどの必須条件が残る間、OS全体の完成とは報告しない。
