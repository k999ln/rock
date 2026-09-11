# rc2 の追加受入 — 2026-09-11

状態: **今回の実測と原本保全を記録済み。一般公開は未完了。** 対象配布物は `1.0.0-preview.20260911-rc2`、native source は `b7d819cd291b653d165aa124f25a52b9898bfb2e`。前回の[導入・保存・再起動・中断復旧](os-acceptance-b7d819c-20260911.md)の3bootとデータは保持している。

## 今回の範囲

- 仕事のlifecycle: 固定b7 imageの別端末で、初回空状態と仕事操作後の2正常boot/終了。導入・更新・権限承認・rollback・無効化・削除・再導入を含む16操作、5jobがPASS_SCOPED。削除後も保存結果を開けることを確認した。これはD2全体や、この5job作成後の再起動試験の合格ではない。
- fresh SDK: 配布archiveから新しいclient/authorityへ702 native fileを展開し、全hash/size/modeを照合。固定sampleによる初回Game A交換、SDK側authorityの停止、元のGame B要求の通信不可診断、同じkeyでの再開、2件完了を4.119秒で確認。独立した停止台帳でも9794c、Game fee6c、hold0、A/B各10単位・grant各1、入金1、月額/引出0、5DB/71表のsnapshotが一致した。合成データ・機械時間の内部検証であり、人の導入時間や新VMの受入ではない。
- OS削除: 別の新規 `/private/tmp/rk11-rc2-remove` へ同じ配布物を導入。`--delete-data`なしの削除を拒否し、対象VMを保持した後、明示付きで製品のremoveを実行。対象VMだけが消え、REMOVED receiptとhost packageが残った。元の受入VM・build設定は不変。これは未起動の空の導入先での削除であり、保存データあり/復旧端末の削除は試していない。
- D6: 別端末で元の5boot・61反復・60分・資源上限・全authority完全不変条件を完了。実測3642秒、全67job、5正常終了、平均0.265 CPU core、最大RSS906808KiB。停止diskを含む977原本を実取得・全hash照合し、6回のauthority snapshotの5DB/71表が完全一致した。前の4→5→6件は次のbootでも保持。最後の61件は停止前に保存され、その後の6回目の再起動は含まない。元observer・閾値は不変。D4に依存しない限定検証として先行した。[独立照合](evidence/rls01/remaining-b7-rc2/d6.json)。
- D1/D3: D6終了後の別diskで元13bootの処理を完了。起動2・system2・隔離1・Store2・Remote2・拒否経路1・Hub障害3が成功。隔離47件＋SDK/tool45件、全authority不変を照合し、diskを含む129原本の全hashを読み戻した。[原本照合](evidence/rls01/remaining-b7-rc2/d1-d3.json)。
- D4: ローカルでは全41bootの原本保存容量を確保できないためGitHubで実行。[34618244790](https://github.com/k999ln/rock/actions/runs/34618244790)の元41boot matrixは16:39:39 UTCに成功、全212原本のarchive・アップロード・実取得による全byte照合も16:48:29 UTCまでに成功した。論理25.674GBを圧縮2.033GBで別のprivate evidence Draft `387142563` に保存。配布用Draft `386933271` は8資産のまま。
- Node SDKの交換契約: exact b7の6 golden vectorをNode v26.0.0で実行し、canonical bytes・hash・Ed25519・署名domainの分離がPASS。全入力は実行前後で不変。[原記録](evidence/rls01/remaining-b7-rc2/node-exchange.json)。

## Game・金融・PC接続・実画面

同じb7 profileでGame 2回・金融UI 2回・PC接続 3回・技術デモ 1回の計8正常bootを完了した。Game A/B各1件、月額888の同じ期間の再請求防止、将来の自動更新取消、ATM未使用保留1000の全額返却を確認。最終残高8906、保留0はすべて合成テストである。PCはTLS接続の通信断から元の要求で復旧し、別bootでoffline結果を再表示した。初回PCはlauncher権限の準備失敗で0boot。VM内umaskだけ訂正した新しい出力先で元試験を実行し、失敗原本も保持した。

停止後の8 guest DB・5 authority DBを独立照合し、748原ファイルを保全した。Game履歴表示とdemoでは元の規則に従いindex clockだけの単調進行を確認し、その他の全71 authority表は同一。D6の完全不変条件へこの例外を持ち込んでいない。[照合記録](evidence/rls01/remaining-b7-rc2/first-use.json)。

実QMPの360フレームを90.04秒・721060byteのMP4へ変換し、元画像の全hashが変換後も不変であることを確認した。エンコード後の動画から6秒ごとの15画面を抽出して目視確認し、Hub検索、仕事実行・保存結果、Wallet、Game履歴の主要表示に破損や切れを認めなかった。これはQEMUと合成Walletの技術デモであり、利用者が完成済みとしたCMの選定・掲載の代替ではない。

## 配布物の構成照合

現在のrc2を7段階のreaderで走査した。候補716、legal bundle315、同梱source archive内430809、rootfs1981、stage0 702の計434523記録を作成し、入力hashを終了時にも再確認した。圧縮inventoryは44,621,005byte、SHA256 `7aeb53e70b5e6a38384876dbbe41c63e99ece4f65b3888b50120d4c7f43f0cd6`。stage0の由来未対応regular byteは0。kernel module索引10件はtarget/rootfsのhashが一致し、depmod生成工程の厳密な再導出証明を保留している。未知の生成元は0で、保持Buildroot手順にdepmod生成の根拠がある。解析不能のarchiveは16種類/17所在、巨大memberは4件（2件重複）を実hashと所在に結び付けた。全container bytesのhash照合と、その本文の全解析を区別し、非展開本文を「解析済み」にしていない。完了後の18原本も全hash・元属性・変更なしを確認して71.45MBのarchiveへ保存し、別readerが圧縮JSONLの全行から434523記録を再集計した。license判定はNOT_CLEAREDのまま。[実走査結果](evidence/rls01/remaining-b7-rc2/inventory.json)。

必要なbuild metadata 1233file/19.44MBも全byte照合した。全807225pathの前後name/stat digestは一致。compiled object全体のhash台帳は、このcandidate照合に不要なため実施しておらず、元buildの削除や退役は行っていない。最初の500000entry上限による停止と空出力は別に保持した。内部diskの空き容量低下に対して、新しい保全先だけを接続済み外部SSDに設定し、保存先の8GiB reserveを維持した。

## 証跡検査コードの修正

Python tarfileが不正な最初の終端ブロックを読み飛ばし得ることを、小さい実データで再現した。全予定memberを読み終えた直後から終端2ブロック・残余padding・gzip EOFを確認するようCI側の保全検査を修正した。新しい境界破損3箇所と全20種類のtar境界を含む24 fixtureが実LinuxでPASS。[検査コードの検証記録](evidence/rls01/remaining-b7-rc2/evidence-checker.json)。native OS・固定配布物・試験期限は変更していない。

D4の同じ圧縮2.033GB・全212原本を修正版readerで再取得し、最初の終端から全byteを照合した。41bootの再実行はなく、12報告原本は前回とbyte-identical。[最終D4照合](evidence/rls01/remaining-b7-rc2/d4.json)。D6・D1/D3・Game/金融・PC・demoの保存archiveも追加の厳密終端検査に合格。今後の検査コード変更では小さいtransport CIだけを実行し、新しいlaunch-plan変更時にだけ長いD4候補試験を自動起動する。

## 残る技術確認

専用の新端末で、通常UIから元の引用整理を起動し、キャンセル操作を1回だけ試みた。取消前の原画面は入力画面のままで、実行中の取消ボタンを確認できなかった。元の仕事は成功し、キャンセルreceiptは作られず、結果は`NOT_OBSERVED_SINGLE_ATTEMPT`。2回の正常起動・終了と保存結果の保持は確認した。元workerを遅くしたり、操作を繰り返して合格を得ることはしていない。実行中childのPIDを観測する証拠がないため、稼働中worker終了の実画面受入は残る。68原本、16個の停止DB、全5 authority DB/71表の完全保持を独立照合した。[観測不成立の原本と確認範囲](evidence/rls01/remaining-b7-rc2/cancel-observation.json)。この補助観測のRSS増分は721328/714104KiBで、計画の524288KiBを超えていた。補助kitは全性能gateを判定していないため、この2bootを性能合格へ使用せず、別のD6長時間試験と区別する。全D0〜D6完了とは表示しない。

復旧は前回の同一owned VMでのcurrent-copy中断からの再開という範囲であり、VM全損や別host復旧の合格ではない。今回の削除は未起動の空端末に限る。実機・実資金・本番providerは対象外。原TLS障害の歴史的原因確定も未解決として保持する。

## 署名とサイト

署名用controlの後続修正2点を、実装2file＋既存test1fileに限定して[Draft PR #6](https://github.com/k999ln/rock/pull/6)へ分離した。個人repositoryのREST欠落時に同じref/SHAのGraphQLゼロ件で保護を確認し、増大するassetの読み取りを開始時size＋1byteで止める。29tests PASS、独立コードレビューで修正必須の所見なし。実policy/trust/keyは含まず、controlのlockや固定SHA変数を変更していない。

[PR #5](https://github.com/k999ln/rock/pull/5)の限定main bootstrap、独立reviewer、管理鍵・Environment、製品license/権利者表記の決定が必要。実署名の承認待ちrunは0。元Sitesの取得は今回もNOT_FOUNDで、再接続が必要。一般公開・main merge・実資金・実機は実施していない。

## 証跡

原本はprivate作業領域 `work/remaining-20260911/` とbuild VMの別検証rootに保存する。大きなdiskや全raw logはGitへ入れず、完了分は[仕事のlifecycle](evidence/rls01/remaining-b7-rc2/lifecycle.json)・[fresh SDK](evidence/rls01/remaining-b7-rc2/sdk.json)・[空の導入先の削除](evidence/rls01/remaining-b7-rc2/empty-removal.json)に最小要約と固定hashを保存した。元の9ab受入はrc2の合格へ転用しない。

## 最終の保存・検証

Web全体の `npm run verify` はPASS（型・lint・93 tests・build・API 143 assertions）。証跡検査のLinux24 fixture、製品要望RQ01〜RQ17と進捗整合、差分チェックも成功。最新commit自身のGitHub CIは[Draft PR #4](https://github.com/k999ln/rock/pull/4)の同SHA checksで確認し、この文書の過去snapshotを後続commitの成功へ読み替えない。今回の変更は作業branchへ保存し、一般公開やmain mergeは行わない。

## 9月11日後続の診断と利用者設定

保存RSSを別readerで再集計した。確実に起動後とみなせる保守的な部分集合は、1回目15sample/28.095秒/7504KiB増、2回目7sample/12.066秒/23376KiB増。ただしready時刻のmonotonicが未保存で、終了操作も含む短い区間なので、steady-state合格やリークなしとは判定しない。元の全区間721328/714104KiB増と512MiB超過は保持する。[計算条件と原本hash](evidence/launch/cancel-memory-reanalysis-20260911.json)。

UIはrun応答の回収前には入力画面に留まり、応答後も対象jobが全snapshotへ現れるまで取消表示を待つ。次はキー受付・API受付/回収・画面present・同じjobのchild PIDをguest monotonicで対応付ける。既存job.resultによる限定取得は改善候補だが、過去の163ms画面の原因確定ではなく、native runtime変更・再build・取消の再受入は未実施。

権利者名kaiya、改変・再配布の意向、新規Sites作成を受領し、CMは制作途中へ訂正。本人限定サイトの公開結果、MIT草案と本人署名方式は[今回の設定](owner-setup-20260911.md)を現在の入口とする。以前の独立reviewer/元Sites再接続が唯一の進行経路という記述を更新する。
