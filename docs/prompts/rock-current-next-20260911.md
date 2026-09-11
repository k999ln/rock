# RockstarOS — スマホ版とローンチ候補の再開指示

2026-09-11の現在入口。`AGENTS.md`、`docs/current-state-20260911.md`、`data/project-status.json`、`docs/product-baseline.md`を読んで、未完了作業を進める。以前の8時間実行プロンプトは実施済みの履歴であり、新しい8時間枠・クラウド契約・main mergeの許可として再利用しない。

最初にGitHubのmain、`codex/rockstaros-launch-candidate-20260910`、PR #4／#7、該当HEADのCIを確認する。旧snapshotを最新確認にしない。統合済みのスマホ準備は`3eeeeed66ed438f8d543ae88260e072c63bd0132`。実装本体はlaunch-candidateで、スマホbranch上だけの文書を新しい正本にしない。

過去の基準入力はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、当初設計snapshot `de5b102d3525daccf604efd5685bdf8c14ad5d50`。設計v1.1承認は`27b34adc02a9e06a4816aa18a5e38cf38b330953`。これらの古い版へ作業を巻き戻さない。

## 優先する作業

1. スマホ実機版の開発を続ける。Pixel 10／GrapheneOSは過去の利用端末に基づく候補で、今回の正確な機種・SKUは未回答。BlackBerry型番も未回答。読取り専用診断と機種適合を確認し、1機種の対象を確定する。QEMU imageを書き込まない。
2. 利用可能なLinux環境はないと回答済み。クラウド初回サーバー代税別10 USDの提案は未承認。アカウント・予算・容量・保存先・終了時の課金停止を確認するまで有料環境を作成しない。その間は機種に依存しない実装・検証を進める。
3. 環境が揃ったら`docs/phone-preview-20260911.md`の固定source／署名検証／vendor準備／build入口を使い、全OSを初めてbuildする。上流更新を確認し、変更が必要ならsource lockと根拠を更新する。最初の組込みはAndroid P1の2APKであり、Hub／Wallet／Game移植は未完了。
4. nativeの既存商品契約、本人認証、権限、台帳、取消・照合・保存を再利用してAndroid接続層を移植する。UID／SELinux／暗号化／電源制約を無効にして成立させない。独自署名・更新・失敗復旧を整え、対象実機で同一imageの受入を行う。
5. QEMUローンチ候補の未完了も保持する。kaiyaの具体的MIT採用、本人署名の方式・鍵保管、制作中CMの完成と選定、キャンセル実停止とメモリ増加の確認、正式署名後の最終受入を続ける。実機版の未検証をQEMU版の過去の合格撤回にしない。

新Siteは本人限定で公開済み。元SiteのNOT_FOUNDは元DB未復元とともに保持し、新Siteを再作成しない。ログイン後の本番Hub操作は未確認。Gitのpushだけで新しいsourceがSitesへ配信されたと記録しない。

## 維持する製品契約と証拠

RQ01〜RQ17、`docs/rockstaros-1.0-strategy.md`の8原則、Hub＋Wallet、tobの商品供給、任意Game入口と継続必須の交換／作者SDKを維持する。月888 USD cents／同一契約の複数端末重複防止、Rock ATM手数料0、未定のゲーム料金と実資金条件は変更しない。

b7/rc2の凍結配布と限定受入を保管する。旧9ab、b7/rc2、最新ソース、標準Androidエミュレーター、スマホ実機、本番金融を分けて報告する。既存imageへ新ソースの合格を付け替えない。

新規テストは「削除すると見逃す現実的な不具合」が説明できるものに絞り、既存との重複や実装コピーを避ける。変更箇所の試験、`npm run verify`、必要なAndroid／native検証、該当SHAのCIを確認する。未実行・skip・条件不足をPASSにしない。

通常の実装・検証・作業branch保存は承認済み。main merge・一般公開・外部告知・課金契約・端末初期化／書込み・本番鍵・実資金については、過去の意思表明と具体的な準備／承認を区別する。承認済み作業を再質問して止めず、条件の揃った範囲を進める。

変更した現在入口と機械可読状態を揃え、`npm run project:update`でREADME／projectを同期してから保存する。完了範囲、残る条件、次の具体的な操作を簡潔に残す。
