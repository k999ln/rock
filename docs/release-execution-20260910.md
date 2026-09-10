# RockstarOS 1.0 — 2026-09-10 実行checkpoint

状態: IN_PROGRESS。開始 2026-09-10T05:43:35Z、終了目標 2026-09-10T13:43:35Z。実働と停止時間は終了時に区別する。製品要件は [product-baseline](product-baseline.md)、今回の指示は [実行プロンプト](prompts/rockstaros-release-20260910.md)。時間経過やDeveloper Previewの名称では合格にしない。

## 起点と担当

GitHub再取得でmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design `27b34adc02a9e06a4816aa18a5e38cf38b330953`、PR #2 `91debc28174d87be023b789980d2c46112a66979` を確認。PR #2はdraft OPEN/mergeable、baseはnative。既存checkoutを切り替えず、専用branch `codex/rockstaros-release-20260910` をPR #2起点で作成。B04の統合をやり直さない。main merge/force pushは実行範囲外。

| 担当 | 専用branch / 所有範囲 | 合格証拠 |
| --- | --- | --- |
| 統括 | release branch、Hub利用体験、統合、発表入口、正本進捗 | 同候補の全gate・UI操作・結果品質・導線確認 |
| A os_acceptance | OS検証worktree、元run44回収、build/長時間受入 | 元plan/hash/終了状態、source/image/tool対応、必要D0〜D6 |
| B installer | 導入専用worktree、packager/installer/guide | fresh環境の取得→起動→保存→復元→所有資源削除 |
| D game_wallet | Game専用worktree、GX00→GX01→SDK | 実TLS/C分離、両台帳、再送/停止/復旧、2作者/2game/2owner |

AI担当の割当であり、製品の実運営責任者・雇用・株式の決定ではない。各worktreeは専用出力先を使い、共通台帳へ同時に書き込まない。

## 着手判断

- RQ07〜10/12/16/17 / 明確な楽観主義・べき乗則 / 失敗後に保存状態が分からない / 既存run44・guest検証器 / 元結果回収と原因別修正 / 5boot・61jobs・3600秒と元期限 / 元planと終了後照合。
- RQ12/16/17 / 販売も重要・0→1 / 開発者の既存VMがないと導入できない / launcher v2・guest・Lima・backup / 対応host一組のfresh installer / 導入から再開/復旧までの成否と時間 / 実配布archiveからの新規導入。
- RQ01〜11 / 逆張りの問い・秘密を探す・競争より独占 / 成果と費用を探す操作 / 既存引用整理・Hub・runner・Wallet / 実画面で詰まりを観測して最小修正 / 同入力の品質・操作数・機械待ち・再探索 / 前後の実操作記録。対象市場は仮説。
- RQ06/08/13〜15 / 0→1・創業チーム / 複数gameで照合が衝突し復旧できない / 既存connections/OwnerRouter/C台帳 / 版付きnamespaceと不足する実TLS受入 / 正当再送・越境拒否・他owner不変 / GX00合格後に合成交換契約とSDKを実装。

## 05:50 UTC 初期状態

macOS 15.7.4 arm64、Lima 2.2.0を候補とする。通常のLima設定にはinstanceなし、Dockerは停止。Aが以前の専用LIMA_HOMEとrock-native VMのhostagentを発見し、元run44計画/ログを回収中。QEMU/試験が現在稼働中かは未判定。既存VM/dataの初期化はしていない。

最終配布候補は未凍結・未build。旧b8287bcのD0〜D5は旧版の限定受入として保持。V01-ACCEPT、PREVIEW-INSTALL、GX00-ISOLATION、GX01-CONTRACT/UI、DX01-SDKはまだ未合格。発表・配布可能とは判定しない。

## 次の具体操作

Aのrun44回収とLinux接続確認、Bのinstaller対象試験、Dのreconcile衝突修正を進める。統括は既存Hubの実画面操作を準備し、引用整理の成果再表示・費用表示と失敗復旧の不足を確認する。工程完了時と30分ごとに実commit、process/job ID、成果、失敗原因、次操作を追記する。大量logとimageはGit外へ保存する。

## 06:28 UTC checkpoint（経過44分25秒）

root HEAD `72da6df`。統合済み: GX00 namespace/実TLS4受入 `e0f3dc8`、旧run44監査 `d0346f8`、1.0表示 `28e5ca6`、Hub sample/実行版 `5ae80ef`、source freeze `f596018`/`d371ce8`、fresh installer `d7927dd`/`72da6df`。現root WIPはGame native UI/Platform境界と発表ページ。branchはまだpush前。

- A: 旧run44は元planを変えず、5boot・61jobs・3641.769秒・正常停止・保存台帳/741画像hashを独立照合した限定PASS。新候補へ移し替えない。中間commit `d7927dd69ddc53e3b95d501c7292ea7f8c015123` はLinux1,425試験/14checks、skip0、source1,176files整合とimage freezeまでPASS。初回tar展開のumask0002による保護guard拒否を保存し、同archiveをumask0022で新規展開して再試験。OSbuildは既存cache使用で約1分。新Game profileのD6/backup観測器を適応中。
- B: fresh Lima VMの依存準備44秒、read-only共有拒否・非共有host home・正常停止/所有VM削除までPASS。host30試験と別Linux29試験。最終archiveからのfreshインストールは未実施。既存8899 viewerは旧taskのPID77657と照合し保持、新配布profileは独立portへ調整中。
- D: GX00既知衝突修正と必須4件を実TLSで合格（Game74＋owner/fence52、skip0）。GX01専用quote、本人承認、両台帳、SDKを実装中。final profileはdevelopment-game-authority/schema7、公開fixture専用、新VMの独立台帳。初期残高0/未登録/未同意。明示的な試験残高追加は別導線。
- 統括: 旧OSで汎用sampleの無効な初回成果を実操作観測し、正常停止後照合を保存。最小修正後C/UIと業務UI41試験PASS。Game UIの初回compileでtest helper名の誤り、実操作でheader hit領域の不足を検出し修正中。最終UI/TLS/QEMUは未合格。
- Web: 既存機能を保ち`/rockstaros`を追加しlocalhost:5173/rockstarosでHTTP200を確認。dev server exec74915。既存Sites project IDの正規取得が`Sites project not found`で失敗し、配布/公開範囲を変更せずローカル原稿を継続。製品LICENSE条件は未記載のため創作しない。

次: Game UIの操作/異常系とPlatformの所有者境界を試験、凍結した中間imageでHub改善後一周と同入力比較、Webの導入/復旧導線を整える。final機能の統合目標08:45 UTC、凍結目標09:13 UTCを維持。中間imageはGame未統合なので発表・最終配布用ではない。
