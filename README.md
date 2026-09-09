# Rock star OS — 自動化ツールの実行・配布OS

標準Hubから自社・第三者のToolを導入し、利用者が許可した条件・権限・費用の範囲で仕事を実行するOSを開発しています。最初の製品端末は**BlackBerryを優先**し、機種・variantはこれから適合確認します。

**Linux / Buildroot / ARM64 QEMUで起動するnative OSの試作を追加しました。** kernel・root filesystem・専用サービス・C/CairoのHub画面、Tool SDKと署名配布、Wallet・MCPの試作を `systems/rock-star-os/` にまとめています。仮想端末での検証とBlackBerry実機対応は別です。実機、実USB、外部金融provider、実際の送金・ATMは未検証で、OS全体の完成ではありません。

開発の入口: [現在の製品方針と統合範囲](docs/native-os-integration.md)、[native OSの使い方](systems/rock-star-os/README.md)、[今回の検証結果](docs/native-os-validation.md)、[次の担当向けCHECKPOINT](CHECKPOINT.md)。標準Walletの新OS契約は月額**8.88 USD固定**です。既存Webのファンド上限料金は試算として保持し、二重課金や自動的な残高移行は行いません。

既存のAndroid試作も維持しています。[AOSP基本設計と改訂](docs/os-development-design.md)、[Android P1手順](docs/os-prototype.md)、[記事ToolのAIDL契約](contracts/README.md)を参照してください。Java・SQLite・2APKのbuild/lintと標準Androidの接続試験は過去CIで成功していますが、自前AOSP/Cuttlefish起動とPixel実機は未検証です。`android/` と `os/device/` はこの補助トラックで、Linux版とは別に検証します。

正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。従来の `gg` checkoutに加え、このリポジトリでnative OSも管理します。製品は「Rock star / avocadomini」の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。

## 開発の現在地

<!-- project-status:start -->
最終更新: 2026-09-09 / BlackBerry優先・native OSのRock統合 / 完了 11/21件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 停止中: sites/mainに別の仕事API・0002移行・アプリUIが存在。追加機能を保持する統合方針の確認が必要 | [記録](docs/deployment-integration.md) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/os-development-design.md) |
| OS02 | Android/AOSP: 対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 未着手 | [記録](docs/os-development-design.md) |
| OS03 | Android/AOSP: CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | Android/AOSP: Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | Android/AOSP: 第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | BlackBerryの型番・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) |
| N04 | BlackBerry実機だけでHub取得・実行・更新・復旧 | 未着手 | [記録](docs/native-os-integration.md) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |

次の作業: nativeの取り込み検証と起動応答WIPの試験を進める。BlackBerryの型番・BSP・復旧条件を確定し、実機だけのHubを検証する。AOSP/Pixelと実金融・実USBは別ゲートのまま保持する。
<!-- project-status:end -->

進捗の正本は `data/project-status.json`。作業ごとに更新し、`npm run project:update` でREADMEとproject.mdを同期します。`npm run project:check` は更新漏れを検出します。

## 今回完了した範囲

- Linux native OSの公開可能な基準ソースを、既存Android/AOSPと衝突しない `systems/rock-star-os/` へ統合。
- kernel/rootfs構成、native Hub、Tool SDK、署名配布・sandbox、A/B更新、Wallet・購入者資格、MCP、AI実行先、運営用部品をRockの正本へ追加。
- BlackBerry優先、月額8.88 USD固定、既存Webの料金試算との境界、実装済み・仮想端末検証済み・未検証を設計書へ反映。
- 移設後のnative Python 1,031件とC検証、既存Web 34件・API 143項目、既存Android契約の静的整合を確認。

ここでいう完了は、**公開ソースの統合と試作基盤の検証**まで。BlackBerry実機で使える製品版や、実資金サービスの完成を意味しません。

## 次に着手する作業

1. `experiments/startup-health/` の未適用patchを分離環境で実装・検証し、採用または撤回する。
2. BlackBerry候補を型番・variant単位で比較し、bootloader、BSP、画面・入力・通信・電源、更新、復旧が成立する最初の1機種を決める。
3. 選定実機で起動し、端末だけでHub検索→直接取得→許可→実行→更新→rollback/uninstallを検証する。
4. 同じHubからdevice local・cloud・実USB PCを接続し、即時接続・解除・結果復元を検証する。
5. 本人確認と購入記録の引継ぎ、Wallet月次888 cents、ToB精算、ATM/provider sandbox、運営配信を外部契約ごとに接続する。

実行順、合格条件、既知の失敗、再開コマンドは [CHECKPOINT](CHECKPOINT.md) に固定しています。

R2の画面確認と修正はGitHubへ保存済みですが、**本番サイトへの反映は未実施**です。配信先だけにあるアプリUI・実行管理・手入力台帳と仕事API/DB移行が重なるため、上書きせず停止しました。保持する機能と再開手順は [統合設計](docs/deployment-integration.md) を参照。

## 既存Web/PC版で現在できること

- ジャンル・キーワードからファンドと自動化ツールを検索。
- Mr.由来のココナラ案件チェック、記事の無料版作成、出典整理をブラウザ内で実行。
- Mr.由来の納品記録照合を含むPC用無料パックを配布。元コード4件をMIT・取得commit・ハッシュ付きで同梱。
- 3件の外部OSS候補も引き続き掲載。
- マイファンドの選択と配分計画。旧マイツール用の保存・導入プラン関数も保持。
- Ethereum互換の注入型ウォレットでアドレス接続。キャンセル、アカウント変更、切断を処理。
- 月$8.88相当の利用料と、電力・通信・API費用の試算。
- ファンドをホームに配置。参加・配分計画・試算条件と実行履歴をアカウントごとに保存。
- 「仕事を進める」から記事販売準備・ココナラ納品準備を作成し、手順・試行履歴・最終確認をアカウント別に保存して再開。
- 基本分配・ブースト・共同留保を、共通収益の範囲内で試算。入金・送金は未接続。
- 同じ4ツールをstdio MCPでCodexから実行。PC接続アプリを起動するとサイトからもMCPでワンボタン実行。
- GitHubとHugging Faceの公開メタデータを収集する管理用コマンド。

ファンドの参加・配分・試算条件、単独ツールの実行メタデータ、仕事の進捗はSitesのD1に保存します。旧マイツール用のローカル保存関数も互換用に保持しています。接続アドレスは保存せず、サーバーへ送信しません。ウォレット接続はログイン認証・実名本人確認・送金認可ではありません。

## 仕事の進め方（現行Web版）

1. ホームの「仕事を進める」から `/work` を開き、サインインします。PCではヘッダー、スマホでは検索・カテゴリの下に入口を表示します。
2. 仕事名と「記事の販売準備」または「ココナラ納品準備」を選んで作成します。
3. 表示された手順を実行します。サンプル・失敗・条件不一致は記録されますが、手順は進みません。納品記録照合には最新版のPC接続パックが必要です。
4. 結果を確認してコピーまたはダウンロードし、次の手順へ進みます。原稿は自動で次へ渡されず、タブを閉じると未保存本文は失われます。
5. 全手順の通過後に確認メモを入力して完了します。応募・外部納品・売上発生を意味する完了ではありません。

保存するのは仕事名・確認メモ・実行メタデータで、原稿や成果物は保存しません。名前やメモに秘密情報を入れないでください。仕事は最新100件、試行は1仕事につき最大200件です。本文保存・古い仕事のページ送り・削除は今後の拡張です。仕事内の実行は仕事履歴に記録し、ホームの単独ツール実行履歴には二重計上しません。

通信失敗時は「記録の保存を再試行」で処理を再実行せず保存だけを再送できます。別タブとの競合時は「最新状態を読み直す」で確認します。

## まだ実装していないこと

BlackBerry実機起動・driver・省電力・端末だけのHub操作、実USB、一般公開Store、実providerの本人確認・売上・送金・ATM、本番運営は未検証です。Linux版の署名package・隔離・A/B更新には限定した仮想端末試験があり、その範囲を統合文書に記載しています。自前AOSP/Cuttlefish、Pixel書込/復旧も未検証のままです。以下は既存Web/PC版の未接続事項です。

ココナラでの自動応募・送信・売上取得、外部サービスの自動登録、売上の取得・自動控除、定期決済、資金の受託、収益分配、投資ブースト、端末の電力・通信量の実測、公開サイトへの候補の自動反映。Mr.のココナラ機能のうち、案件条件チェックと納品記録照合を独立して取り込みました。Mr.全体の自律運転は移植していません。

「月13万円」「作成者が6万円を稼いだ」はユーザーから共有された構想・伝聞であり、根拠未確認。実績や利益予測として掲載しません。

## 既存Web/PC版の開発

Node.js 22.13以上（作成時の検証はNode.js 26）、npmを使用。

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev
# 作業を終えたら進捗と品質を確認
npm run project:update
npm run verify
```

Vinext / React / Cloudflare Workers / Sites。Sitesのサイト設定は `.openai/hosting.json`。開発サーバーの表示したURLを開く。秘密鍵やサービス認証情報は追加しない。

`verify` は進捗の同期・型・プロダクトコードのlint・自動テスト・本番ビルド・ローカルWorker/D1のAPI検証を実行します。API検証はMiniflareで本番APIバンドルを直接起動し、一時DBと合成ユーザーだけを使います。本番データには接続せず、資産ルーティング・開発プロキシ・画面操作は対象外です。GitHub Actionsも同じコマンドで検証します。`npm run lint` は未変更の生成済みUI部品も含む全体検査で、既存の指摘が残っています。

DB変更時は `npm run db:generate -- --name=変更名` で移行を生成し、SQLを確認します。外付けSSDのmacOSメタデータを除外して生成するラッパーです。既存の移行SQLを書き換えず、追加入力として管理します。

`origin` はGitHubの `k999ln/rock`、`sites` は既存サイトの配信用です。GitHubへのpushだけではサイトは更新されません。本番へ適用するDB移行もSites公開時に別途確認します。

```sh
npm run discover -- transcription
```

GitHubのリポジトリ検索とHugging Faceのモデル検索を並行実行し、`data/discovered.json` に保存。認証なしの公開APIなのでレート制限あり。失敗は記録し非ゼロ終了、成功した情報も保持。取得結果は未審査データであり、コードを実行せず、公開カタログへ自動追加しない。カタログは `lib/catalog.ts` で明示的に管理。

Product Hunt APIは商用利用条件の確認前のため未接続。サービスの公開ページへのリンクのみ。

## 次に追加する順番

1. native OSの公開ソースと再現手順を維持し、起動応答・自動再読込の未検証変更を試験する。
2. BlackBerry候補の型番・variant、bootloader、BSP、更新・復旧を確認し、実機へ載せる方式を固定する。
3. 実機だけでHub検索・取得・導入・実行・更新・復旧を通し、第三者SDKの体験を検証する。
4. 実USB、許可した外部MCP/AI、金融provider sandbox・ToB精算、運営配信を順次接続する。

AOSP/Pixelは比較・移植候補として保持します。GitHubへの追加と本番サイト公開は別作業です。既存Sitesの公開停止条件は維持しています。

詳細は `docs/product.md`、`docs/architecture.md`、`docs/research.md`、`docs/validation.md` を参照。

## 配布条件

GitHubの `rock` は公開リポジトリです。Rock star独自コードの再利用ライセンスは未選定であり、ソースを閲覧できることとOSSとしての再利用許諾は別です。カタログで紹介するOSSは各公式ライセンスに従い、モデルの重みは個別に確認します。Mr.から取り込んだ4ファイルは `vendor/mr/LICENSE` のMIT条件で同梱しています。PCパックのRock starアダプターとサンプルも同じMIT条件で配布します。認証情報や過去の案件データは含めていません。

## Mr.から取り込んだツール

ブラウザで3ツール、PCで4ツールを使えます。`docs/mr-integration.md` に取得元と移植差分、`toolkits/mr/README.md` に実行方法があります。

```sh
python3 scripts/package-mr.py
python3 toolkits/mr/rock_star_tools.py coconala-check --input toolkits/mr/examples/coconala.json
```

PCパックは `public/toolkits/mr-toolkit.zip`。元コードのハッシュが変わると実行・再梱包は失敗します。

詳しい今回の動作と会計モデルは `docs/fund-and-mcp.md` を参照。

ローカル保存領域の初期化: `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc`。プレビューの保存には `/signin-with-chatgpt?return_to=/` から標準のローカルサインインを使います。
