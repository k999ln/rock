# 73 現行製品の重複・類似処理の統合

本人指示（2026-11-20）: 残る重複・類似内容を、必要な機能を保ってまとめ、現在の方針に揃えてGitHub mainまで反映する。task72 / PR325の続き。

## 対象

- 現行Noah/Eve: `lib/noah-*`, `lib/eve-*`, `components/noah-*`, `components/eve-*`, `app/noah/`, 互換入口`app/sky/`, `app/api/noah/`, `services/sky-web/`, `scripts/noah-*`とその共通helper。依存先・対応テストは呼出箇所を追って読む。
- 共通Workとの接続。Agent選択・本人Mac接続・実行・結果・停止と、既存の登録/審査/公開/復旧を保持する。
- `docs/structure/00,02,03,04,05,06,07,09`、対応する`docs/services/`、README、現在の進捗と次回prompt。設計の優先順位・同じ説明の複製を整理する。
- 保全sourceの採否はtask72の分類を参照し、現行と同じ機能の再取り込みを避ける。必要な独自機能は消さない。

## 制約

miiが主商品、Noahが最小構成、本人Macを最初に完成、その後に声/Eve/空間操作。SIM/eSIMはOS導入の仕組み。Eve→Noa→AMC→Jevの責任とBroker/Walletのgateを維持する。API path・DB table・enum・環境変数・料金は変更しない。

Private Pixel・Pro・robo data bank・MATOU・Princeton、archive/、docs/evidence/は変更しない。独立した端末実装や異なる同意/権限契約を、似ているだけで一つにしない。公開再配備・本番DB migration・実資金・端末操作は実施しない。

## 合格条件

1. 対象内の重複候補ごとに、共通化先または分離を維持する理由をこのtaskに記録。
2. 共通化前のAPI/画面契約・本人境界・停止/復旧を既存試験と必要な回帰試験で保持。
3. 現行設計は正本への参照に揃え、古い方針や未受入を現在の完成として表示しない。
4. `npm run verify`、該当の設計/Sky検査、PR同一SHA CIを確認し、通常PRでmainへ統合。完了・残件・検証結果をPR本文へ記録。

## 調査・検証

開始時main: `c4d7c2732d899ccabe23654a62f89f2704cbaa8c`。対象329ファイルのbyte一致・連続12有効行の一致を調査し、丸ごとの複製はなし。短い行へ圧縮された類似処理は呼出関係と振る舞いを追加確認する。


## 重複候補の採否

| 候補 | 採用した整理・維持する機能 |
| --- | --- |
| Mac plugin/3 loaderに散る認証header転送・URL・timeout | `scripts/noah-local-api.mjs`へ集約。loopbackとNoah APIに限定、許可headerだけ転送、redirect拒否。外側のsocket/Origin/本人確認は維持 |
| Work・instance・operationの類似JSON要求 | 同じhelperの明示的な3契約へ集約。queryの許可キー、instanceのowner応答照合、元のstatus/error、再送なしを保持 |
| 単一コード/複数ファイルprojectのTS検証 | `scripts/noah-source-typecheck.mjs`へ集約。入力sourceとTypeScript標準library以外を読まない。各経路の対象ファイル・基準directory・エラー件数/長さを保持 |
| 私有登録・招待・公開版のstream読取り | `scripts/noah-source-bytes.mjs`へ集約。容量上限・受信量・中止を共有。招待の期限/再検査、公開版のmanifest/利用権はloaderに残す |
| EveのTool/Newsの通信 | `lib/eve-work-client.ts`へ集約。依頼ID/revision/command ID、同意、失敗時の復旧を画面・Work側に保持 |
| 保存済み担当/目的から作る担当 | 既に`purposePort`と`createRuntimeEveWorkPort`を共有。担当作成と実行の段階は異なるため潰さない。公開案内のSmith/Sky/smisをNoahへ揃える |
| Noahの表示・旧URL | 既存`noah-surface`・`noah-page-routes`・共通navigationを維持。互換APIを消さず、正規入口を`/noah`へ統一 |
| ローカル接続・公開Runner | 別の認証契約。cookie/localhostとdevice session/HTTPSを合体させない。仕事の正本は既存Workを共有 |
| 設計・README・進捗の同じ説明 | 製品順序はstructure/00、名前は06、Noah契約はservicesへ集約して参照。矛盾する公開前/公開後の説明と古い優先順位は現在の入口から除き、task69/70/72等の履歴参照を残す |
| 旧試作の独自機能 | task72の保全原本を保持。現行の同じ契約を旧schemaで再実装しない。異なるhardware/未受入機能を「重複」として削除しない。今回対象外のPrivate Pixel等には変更なし |

初期の対象試験83件＋共有境界4件は成功。初回typecheckは作業用checkoutのStripe依存不足で失敗し、lockfileどおりnpm ciで依存を揃えて再検証する。設計JSONのパス移動なし、既存API/DBの改名なし。

追加の構文解析で403関数（180〜3500token）の類似を比較し、残った高類似の2つのcompiler hostを共通化。関数名や入出力型が似ていても認証・保存・停止の意味が異なる処理は統合しない。

事業正本05にも残っていた「入口はeSIM一本」と旧月次優先順位を現行Noah→miiへ同期。金額自体を決定・変更せず候補として扱い、旧月次/年次表は検討履歴と明示した。

PR: https://github.com/k999ln/rock/pull/326 。追補48件（共有境界4件を含む）も成功、先行83件と合わせ対象131件成功。Mac配布ZIP生成・bundle読込みも成功（Git外`work/task73-mac-package`）。型検査は依存導入後成功。全verify初回の追加testのno-floating-promises 4指摘はawaitで修正した。

全verifyの2回目は4,437件中1件失敗（4,432成功・4skip）。`project-bot-context`の失敗時に並列Git読取りが残り、fixture削除と`git status`のindex更新が競合してENOTEMPTYになった。単体再実行だけでは成功するため、テストのretryではなく`scripts/project-bot-context.mjs`で全Git子処理のsettle後に失敗を返す。対象外機能の変更ではなく全体検証で発見したGit後処理の修正として、対応テストに遅延したstatusとの決定的回帰を追加。

## 最終検証

`npm run verify`はexit0。本体4,438件中4,434成功・失敗0・skip4、build/API/保存回帰/設計/担当整合まで成功。対象試験は83+48+12件成功。Mac配布ZIP（129file、SHA256 `7b1f66fd3e569179082e2dbe6e3760bed539510c013bccfe09b9be0ebcc11cd4`）の生成とbundle読込み成功。新しい実機・本番・別Macの受入は含まない。最終headの同一SHA CIと通常merge/main読戻しは[PR326](https://github.com/k999ln/rock/pull/326)を正本とする。次はtask71の本人Mac通し受入へ進み、共通処理を複製せず本taskの対応表を使う。
