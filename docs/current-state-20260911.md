# RockstarOS — 現在の開発状態と再開条件

2026-09-11、利用者の「ここまでのところをrockに矛盾しないように追加して」に従い、スマホ版の準備をローンチ候補の開発本体へ統合した。本書と`data/project-status.json`を現在の入口にする。日付付きの過去の成功・失敗は保持し、古い「次の作業」を現在の指示として実行しない。

## 製品の方針

RQ01〜RQ17、Hub＋Walletを中心とする製品、自作ゲーム交換／作者SDK、tobの商品供給、PC／cloud／self-hostの実行先を保持する。既存の月888 USD cents／同一契約の複数端末重複防止、RockのATM手数料0、未定のゲーム料金を変更しない。実行成功を実売上へ変換しない。

スマホ本体へ書き込めるOSを作るという最新指示を実機版の開発方針へ追加した。現在のPixel 10／GrapheneOS候補は以前の端末記録に基づく。今回の対象機種・SKUは未確認で、BlackBerryの型番も未確認。全機種対応・既存OSとの共存・データ無消去の入替えを約束しない。

## 実装と検証の区分

| 対象 | 現在確認できること | 残ること |
| --- | --- | --- |
| Linux / Buildroot / QEMU | b7/rc2の内部導入、起動、保存、再起動、同じVMでの中断復旧と追加受入を限定確認 | 正式署名後の最終配布受入、キャンセルの実停止、メモリ増加の確認等 |
| Android P1 | 通常権限の2APK、SQLite／Binder／JobScheduler、標準エミュレーターCI | 実機確認、Hub／Wallet／Gameの移植 |
| Pixel候補のOS | GrapheneOS安定版の署名タグ確認、機種構成へのRock組込み設定、source検査、Linux build入口、読取り専用診断を実装 | 全source取得、Soong／OS build、正式Android署名、起動・更新・復旧の実機受入 |
| Web / Sites | Hub改修、履歴のコード統合、新しい本人限定Siteの公開 | ログイン後の本番Hub操作確認、一般公開 |

QEMUの凍結sourceは`b7d819cd291b653d165aa124f25a52b9898bfb2e`、版は`1.0.0-preview.20260911-rc2`。今回の統合で既存image・配布bytesは変更していない。QEMUの合格をスマホへ移さず、スマホ用の書込み可能imageはまだ存在しない。[rc2受入](os-acceptance-b7d819c-20260911.md)／[追加受入と未観測条件](rc2-remaining-acceptance-20260911.md)／[スマホ版の実装](phone-preview-20260911.md)。

スマホ版は既存Android P1を機種構成へ組み込む段階から始める。LinuxのHub／Wallet／Game契約を維持しながら接続層を移植する必要があり、2APKの同梱だけで製品移植完了にはしない。旧Cuttlefish用`os/source-lock.json`、新しい`os/physical/frankel-source-lock.json`、Linux QEMUのimageは別の入力である。

## 所有者の回答と公開設定

- 権利者公開名は**kaiya**。自作部分の改変・再配布を許可する意向を受領済み。具体的なMIT条文の採用は未回答。第三者由来の条件と配布物の許諾確認は別に残る。
- 署名意思は受領済み。第二承認者は未指定で、本人だけの署名経路を実装・試験済み。本番鍵の生成・保管・実署名は未実施。保護GitHub署名経路と本人署名経路は選択肢であり、PR #5の登録や第二承認者を本人経路の共通必須条件にしない。
- [新しいSite](https://rockstaros-kaiya.noellesugar1.chatgpt.site)は本人限定で公開済み。配信sourceは`a750908329d42bbfb78e07243f414b51d1534cf8`。元SiteのNOT_FOUNDと元DB未復元は別の履歴であり、新Siteも接続不能という意味にしない。今回のGit統合はSites再配信ではない。
- **CMは制作途中**。69秒候補を選定・完成・掲載済みにしない。90秒の技術デモとCMを区別する。

[所有者回答](../data/release-owner-intent-20260911.json)／[本人限定公開の証拠](evidence/launch/sites-owner-private-20260911.json)／[MIT草案](license-proposal-20260911.md)／[本人署名経路](owner-manual-signing.md)。Mac配布用署名はAndroidのAVB／APK／APEX／OTA署名を代替しない。

## Linux環境と費用の回答待ち

利用者から「使えるLinux PC／サーバーはない」と回答を受領した。前回、クラウド候補と初回サーバー代**税別10 USDまで**を提案したが、費用の承認はまだ受けていない。今回の「rockに追加して」は記録と開発branch統合の指示であり、契約・支払いの承認に換算しない。

クラウドのアカウント、利用可能枠、予算、保存先、終了・課金停止の手順を揃えてから、専用x86_64 Linuxで取得・buildを進める。サーバー・鍵は未作成、自動削除や費用上限の制御も未実装。前回示した1 USD/時と使用時間の計算例は価格調査の記録であり、OSの完成時間・総費用の保証ではない。[構成と再確認する公式料金](phone-preview-20260911.md#ビルド環境の具体案)。

## Gitへ統合した範囲

スマホ準備のcommit`3eeeeed66ed438f8d543ae88260e072c63bd0132`を、`codex/rockstaros-launch-candidate-20260910`へ履歴を保って取り込んだ。PR #7はその変更単位、製品全体の確認先は[PR #4](https://github.com/k999ln/rock/pull/4)。現在の統合HEADはGit／PRで確認する。

開始時のmainは`7cdbb5fedc86ee3978ed329d9312147d137c9199`。mainへのmerge、一般公開、Sites再配信、クラウド課金、端末書込みは今回実施しない。通常の実装・検証を再承認待ちに戻さず、必要な条件のない操作だけを保留する。

スマホ準備commitのGitHub4check（Web、Android、準備検証のpush／PR）は全て成功。[同一SHAの記録](evidence/launch/ci-phone-3eeeeed.json)。これは全OS buildや実機受入ではない。今回の文書整合後の検証結果は`project.md`、最新HEADのCIはPR #4で別に確認する。

次回の実行入口は[現在の再開指示](prompts/rock-current-next-20260911.md)。ローンチ状態は**BLOCKED_FOR_LAUNCH**を維持する。
