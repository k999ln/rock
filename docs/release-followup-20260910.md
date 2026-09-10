# RockstarOS 1.0 — 8時間作業の完了記録とCM完成後の残件

2026-09-10追加: 文書commit3d07df0のnative CIが600秒で失敗したため、[主suiteの分割と原証拠照合](native-ci-partition-fix-20260910.md)を実装。Linux1660件と修正f88b392のGitHub native全6job／root UI／Webは成功し、原本を独立照合済み。以下の1a2成功はその時点の履歴として保持する。

記録日: 2026-09-10 UTC。利用者の「ここまでのところをrockに矛盾しないように追加して」に基づく追記。会話の申告、検証済みの進捗、担当AIの見積もりを区別する。RQ01〜RQ17、同契約月888 USD cents・複数端末で1回、Rock ATM手数料0、ゲーム料金未定を維持する。

## 利用者からの更新と納期の見積もり

- 利用者から「もうcmの作成できてんで」と申告を受けた。**CM制作は完成済みとして残件から外す。** この会話では完成CMのファイル・URLはまだ特定されておらず、内容の実見・表現照合・掲載を完了したという意味ではない。
- 前回作業の90.04秒の実OS録画は、別途検証した技術デモ。利用者が完成させたCMと同一の素材だとは判断しない。
- 残る導線作業は、既存CMの確認可能な素材を起点に、対応環境・制限の説明と既存の告知／導入ページへつなぐこと。新しいCMを制作する作業へ戻さない。
- 会話で担当AIが示した「**追加1〜2日**」は、QEMU Developer Previewの仕上げと導線整備に対する条件付きの粗い見積もり。間欠的なエラーの原因を解消し、変更範囲の検証・統合を終えられる場合を想定している。**製品LICENSE／第三者再配布条件とSitesアクセスの解消待ちは含めない。** 原因が未確定なので延びる可能性があり、確定した納品日・保証・実測工数ではない。実機版や実資金対応の所要日数でもない。

## 検証済みの現在地

配布nativeと同梱host toolsは `9abf78a80d27aa9f847c4051d20e4c552e407276` に固定。後続の診断・Web・証拠を含む統合版は `1a2f4d1afc68e8920b084302e8c9f1271c1478e2`。この追記の文書commitとは分けて扱う。

- 同一9abのD0〜D6は限定範囲で合格。D6は3646.616716秒・61反復job・5正常boot。凍結候補のnative回帰は14checks／1631実行／skip0。[OS受入](os-acceptance-9abf78a-20260910.md)、[元FAILと追加回帰](os-native-repeat-20260910.md)を参照。
- 実OSでGame A/B、合成Walletの月額・ATM予約取消・保存、引用整理の遠隔要求2件／3bootを確認。遠隔先は所有する隔離TLS runnerであり、一般の物理PCや本番cloud全体への適合確認ではない。SDKの複数owner契約試験と、実OS UIの1owner試験も分ける。[Game受入](evidence/gx01/final-9abf78a-20260910.json)、[実OSの段階別結果](evidence/hub-final-9abf78a/final-c01-completed-stages.json)。
- private GitHub draftから9配布ファイルを実取得し、署名・hash照合、新規の専用VMへの導入・初回処理・停止・削除を確認。復旧の合格範囲は同host／同VMのcurrent-copyと新端末名であり、任意の旧backupや別host、新VMへの移行の合格ではない。[配布受入](evidence/rls01/final-9abf78a/summary.json)、[GitHub実取得からの導入](evidence/rls01/github-direct-install-9abf78a/summary.json)。
- 90.04秒の実OS動画と案内／導入ページを作成し、ブラウザで表示・再生・導線を確認。一般公開は未実施。人の作業時間短縮、需要、収益、継続利用の効果は未計測。
- 統合版1a2f4d1の[Web CI](https://github.com/k999ln/rock/actions/runs/34483209629)と[root UIを含むNative CI](https://github.com/k999ln/rock/actions/runs/34483209632)は成功。nativeは14checks／1656実行、697入力と14ログを照合済み。[native照合原本](evidence/rls01/final-integrated-ci-1a2f4d1.json)、[Web照合原本](evidence/rls01/final-web-ci-1a2f4d1.json)。この結果を9abの配布受入や後続文書commitのCIへ移し替えない。

8時間作業の開始は05:43:35 UTC、最終判定checkpointは13:45:19.822614 UTC。経過は約8時間1分44秒で、tool／CI待ちを含む。CPU稼働時間や人の実作業時間は未計測。成果物の最終書出し・保存はこのcheckpoint後に行った。[元時刻記録の抜粋と出典hash](evidence/rls01/final-handoff-timing-20260910.json)。

## 残件と公開を止めている条件

1. 間欠的TLSエラーと600秒TIMEOUTの原因を特定する。9abの元ARM64 FAIL、e430のTLS ERROR、ba900のTIMEOUTを保持する。後続の診断wrapperによるdirect-script不具合は修正し1a2 CIも合格したが、先行する間欠障害の原因は**UNDETERMINED**のまま。期限・判定基準を緩めて完了にしない。
2. 製品LICENSEと第三者の再配布条件を確定する。配布物の `legal: NOT_CLEARED`、manifestの `acceptance.status: CANDIDATE`、packaging-resultの `status: PACKAGED_NOT_ACCEPTED` は保存時の値を維持する。内部受入の追記で署名済みファイルを書き換えない。
3. 既存の本人限定Sites projectを現在の接続accountから取得できる状態にする。取得結果はNOT_FOUNDで停止中。既存機能・公開範囲を保持した統合と公開後確認が残る。[公開の統合条件](deployment-integration.md)。
4. 既存CMを案内／導入ページに接続し、その素材の表現を実際の合格範囲と照合する。CM完成はOS公開条件の解消を意味しない。実機対応・本番金融・未測定の効果を完成扱いにしない。

配布先はprivate draft releaseで、匿名の一般ダウンロードは利用できない。公開用の信頼基盤も開発用公開鍵の合格とは別。Physical Device Previewは正確な機種／variantの確定と別の実機受入が必要。実ゲーム・実資金・逆交換、別host復旧、Game接続の期限後再接続などの制限は[既知制限](preview-release-notes.md)と各受入報告を引き継ぐ。

## 再開順と今回の保存範囲

1. `git fetch origin` と `gh pr view 3 --json headRefOid,baseRefName,state,isDraft,statusCheckRollup` でbranch／同SHAの状況を取得する。再開先は `codex/rockstaros-release-20260910`、[PR #3](https://github.com/k999ln/rock/pull/3) は今回確認時点でdraft／OPEN、mainへの統合は未実施。
2. 原FAILと診断結果から間欠障害を切り分け、必要な修正と対象回帰を実施する。配布native／同梱toolsを変更した場合は新候補を固定し、同sourceのCI・同一imageのD0〜D6・fresh導入／復旧を取り直す。文書追記だけではOSの再試験実績を追加しない。
3. 並行してLICENSE／再配布条件、既存Sitesアクセス、既存CMから導入案内への接続を整える。条件が揃った対象で公開と公開後確認を行う。待ち時間を除いた概算を公開日へ置き換えない。

今回の変更は進捗・会話の補足と最終CI原本のGit保存。新たなruntime実装、OS imageの再build、CM制作・掲載、公開、実機書込み、実課金、main mergeは行っていない。task／phaseGateの状態と完了19/34件を保持する。検証コマンドは `npm run project:update`、`npm run verify`、`git diff --check`。この文書変更の検証結果は[実行記録の追記](release-execution-20260910.md)に記載する。
