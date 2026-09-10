# RockstarOS 1.0 Developer Preview — 同一候補の受入報告

12:42 UTC時点の内部受入記録。D0〜D6とCのGame/金融/引用遠隔は限定範囲でPASS。90.04秒の動画を実収録・encodeし、媒体の目視/ブラウザQAと最終追加local回帰を集計中。`docs/templates/os-acceptance-report.md` の対象・全gate・復旧表・残課題に沿って統合する。元の時点別reportは上書きしない。

## 1. 対象と許可範囲

対象repositoryは `k999ln/rock`、作業branchは `codex/rockstaros-release-20260910`。配布native source・同梱host toolsは `9abf78a80d27aa9f847c4051d20e4c552e407276`。Web・診断補助・受入記録の最終commitは別に記載する。

入力はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、設計 `27b34adc02a9e06a4816aa18a5e38cf38b330953`、起点operational `91debc28174d87be023b789980d2c46112a66979`。既存設計承認と2026-09-10の8時間実行指示により、通常開発、合成Wallet/Game、新規の所有VM、作業branch保存、draft PR/Release、発表媒体の準備を実施した。main merge・force push・実資金・実機書込・外部募集や告知送信は実施していない。

buildはDebian13.6 aarch64、kernel6.12.95、Buildroot2026.08/GCC15.3.0、Python3.13.5、QEMU10.0.11。旧build cacheを再利用したためclean-room buildとは称さない。全1364 source filesを凍結Git archiveと照合し、09:38:05–09:40:02 UTCにbuild、09:41:23にprofileを固定した。profileの変更は検証済みWallet開発設定2fileと親directoryのみ、全1981 filesystem pathsの内容・所有権・mode・symlinkを照合した。

| 固定対象 | SHA-256 |
| --- | --- |
| Image | a15eb83ce94adf1d067130d422e20bdd5538fda724eb816b4d8b9e79a1f52197 |
| rootfs.ext4 | 0c5893425ab76256875b23b0c1c0ca34c211480b493a69d9fb502c4140a2825c |
| stage0.cpio.gz | bf4200977ac520dd097f4bc7c1fc7cd87702d6ca4e3f9e0a73b4a8b555e41c01 |
| freeze-manifest.json | d258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc |
| profile.json | 0d6f4924d98f1cd43d4e3104b9a9c3b4f2a4b2557e96f64bd626f9930f4b34bb |
| sandbox configuration | cdb9609518187dc057a4e747d28b9550da0946c59636fc0cc8346027cdb5ab9c |
| corresponding Git source tar | 1fac2382110401638dd9ea6d5d5d4d67bf902b5198f5bd38a187c66508719532 |
| Mac arm64 package | 121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2 |
| release-manifest.json | e06fb8d9df292103e63f6cd56df95b189202ae0b13b6e1c578cb6eef0ffc5971 |
| development verification key DER | 06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9 |
| legal-info / corresponding sources bundle | 7c9cdc0d32faf4006b8693d5d8dc85efd8259ae937c90274888da3f943920a0c |

実機・本番金融・外部provider・実ゲームは対象外。公開RFC8032試験鍵、開発CA、公開認証fixture、合成入力を使用する。対応hostはmacOS15.7.4 Apple Silicon / Lima2.2.0の内部受入範囲。専用Debian13 VMの既定diskは16GiB、hostには10GiB以上の空きと必要依存を要求する。全構成backup・復旧の同時disk容量も実測した。

## 2. 判定一覧

| ID | 必須受入と範囲 | 実測・証拠 | 現段階 |
| --- | --- | --- | --- |
| D0 | 同じsourceのnative回帰・固定 | Linux x86_64 CI34459916162、1631 executions/14checks、全694inputs・原logs照合 | PASS（別arm64原FAIL保持） |
| D1 | 同じbuildの起動・system | boot2・system2、同source/image固定、元report/hash照合 | PASS_SCOPED |
| D2 | HubのlifecycleとWallet利用 | A元lifecycle 16ops/5jobs/2正常boot＋C金融2boot＋引用遠隔3boot/同要求回復・再表示 | PASS_SCOPED |
| D3 | 認証・隔離・制限・拒否 | isolation47/SDK45、Store2/Remote2/negative1、Hub crash/deadline/recovery3。元10＋新3boot | PASS_SCOPED（診断読取修正あり） |
| D4 | startup・A/B・容量・auth・data ABI | 原完了10boot＋新31bootの41項目、report e93dca22501e92f31d098a99abfdb8f8731e77ca1ac8df1df94dc310be042f7d | PASS_SCOPED |
| D5 | 正常停止・再起動・全構成復旧 | B3boot、実16MiB途中SIGKILL、同intent再開・原epoch一度・3disk一致・元端末拒否・122表保持 | PASS（same-host/current-copy範囲） |
| D6 | 5boot・61soak jobs・60分・資源 | 独立GitHub34465689434、inner3646.616716秒・67全jobs・61soak・5guest正常終了、元閾値・全保持 | PASS_SCOPED |
| GX0 | 複数owner/game分離・本人接続 | 既存GX00統合＋同9abの契約24要件、実TLSと実SIGKILL11境界 | PASS_SCOPED |
| GX1 | Wallet→合成GameとOS操作 | 契約・B実GameA・SDK A/B、C OS両Game各10units一度＋独立台帳監査・2boot保持 | PASS_SCOPED |
| GX2 | Game→Wallet | 初版の許可方向ではなく無効 | NOT_RUN / 対象外 |
| GX3 | 切断・競合・元要求再照合 | 同9ab24契約・SIGKILL・current-copy・freshSDK | PASS_SCOPED |
| DX | 共通SDK・fresh作者導入 | GitHub実取得9file、SDK初回2.202s/原因診断0.131s/元要求回復1.173s、全71表停止照合 | PASS_SCOPED（機械時間） |
| AF | ATM Rock徴収0 | C実UI quote1000/fee0→hold1000→未使用分取消、元AVAILABLE8906に戻りdispense0 | PASS_SCOPED（合成） |
| H / S / P | 実機・実provider/実ゲーム・実資金 | 接続先や取引条件を創作していない | NOT_RUN / 対象外 |

D4のA/Bは同9ab由来の派生slotであり、旧b828 OSと新Game userdataの一般的な読み書き互換ではない。旧narrow clientの明示import・非空Walletの管理下migration・実中断/hold/epoch引継ぎは限定範囲で確認した。既存local profileの自動Game転換と旧OSによる新userdata一般rollbackは未実装/未実行。詳しくは `docs/os-final-compatibility-20260910.md` を参照。

D4最初の全runは診断fixtureのpidfd SIGKILL後の/proc読み取り競合でFAIL。完了済みready2/absent4/freeze4は原ログを元assertionsで再照合して再利用し、crash4のみ診断差分f7c391c（統合d6647e3）を使って取り直した。残A/B8/fault13/auth3/dataABI3は元9ab verifier。診断fixtureがimageへ非搭載であること、production20入力・ELF・5assertions・全source/image不変を確認した。元13boot全体のFAILをPASSへ変更していない。

D1/D3の元全体runは10boot完了後、Hub故障の起動前にdebugfs rdumpがWallet設定UID/GID1003を単一UID usernamespaceへ再現できずFAIL。凍結imageの所有権を変えず、診断専用のread-only inode inventoryへ変更した（元7e9dcc9、root04d24a3）。全7後続読取をinventoryのsize/SHAへ結び付け、UID/GID/mode/symlinkも検証する。Linux24検査と実image preflightの後、元期限・fixtureの新3bootがPASS。元whole3FAILは保存し、元1364source/imageと診断helperの非搭載を照合した。全gate終了後の11:45:36 handoffは全5DB/71表/8JSONが初期と一致し、19表empty・QEMU0・対象port空き・C専用保存先不存在を確認した。

D6はクラウドの別Linux x86_64 host上で同じ署名付き配布物を展開し、元9abのcanonical observerを実行した。inner60分46.617秒、61反復・全67job・76操作、5回のguest SHUTDOWNを記録。QEMU host peak RSS902448KiB、増加62480KiB、平均0.359541cores、最大samplegap2.147293秒、1820samplesで元上限内。全5DB71表8JSONと19emptyが不変、Game SDK clock0/bindingsなし、非Hub全role・署名slotも保持。private asset554887744を実取得し、rootが全916file/378262134Bの原本とarchive SHAaa7c64f1e9c58860d27b04399911c354d62e94a843616207da9c0478d7bb4d4eを再照合した。host QEMUの資源でありguest各serviceの計測ではない。

D0の別arm64全回帰は10TLS read/frame deadline ERRORでFAILを保持する。全1631件を同じsourceのx86_64 CIが通り、10caseは別の既存Linux scoped runで各一回okを確認したが、元arm64エラーの原因は未確定。特定host負荷への推測を確定原因として記載しない。

## 3. 利用体験とケース記録

C01は新しい専用端末で、本人の登録・PIN・合成信用10000一回の同意後、Game A/B各103（購入100・合成fee3）を本人承認し各10units一度だけ付与。2正常boot後の独立監査でAVAILABLE9794、GAME_FEES6、hold0を確認した。元Game reportのPENDING_LEDGER_AUDIT表記は残し、その後の独立audit PASSと組で判定する。

金融一周は月額888を同じ契約月に一度だけ払い、同月の再確認で増えないこと、将来の自動更新取消、ATM1000/fee0のquote→本人承認→hold→未使用分取消を確認。8段階の整合した読取トランザクションと、2正常終了後の全構成停止照合で、最終AVAILABLE8906/hold0/dispense0、両Game資産各10を保持した。引用試験の失敗後にこれらの金融操作を再実行していない。

引用遠隔は実loopback TLSの所有runnerで2件の同じ公開150-byte入力を実処理する。1件目の完了後にrunnerを停止、2件目を保留のまま通常終了し、2boot目で元要求を回復、3boot目でrunner不在でも保存成果を再表示した。3boot/248.407294秒はPASS_SCOPED_PC_LINK。これは実PC機器・本番cloud接続ではない。90秒の実録画・停止後の全nonHub/authority照合はPASS、Macのffmpegで90.04秒/360原frame+終端1frameのH264に変換。全824原file/58,595,047bytesをLinuxとMacで独立照合した。動画の最終目視/再生確認は別記録へ集計する。

最初の引用試験は親umask0002→0775 launcherをguard拒否（guest0）。次の試験は既存1.0に存在しないinstall labelを探してFAIL（guest1）、host-onlyの停止台帳・署名検証付きupdate selector B担当の664f67aを追加。さらに新registryの同revision異内容をguestが正しく拒否（guest1）。固定値を消さず元署名registryを再利用し、両失敗bootは別の通常終了証跡で閉じ、全authority/nonHub/旧Hub jobsを保持した。失敗時の画面遷移・小ラベルOCR失敗・停止直後TIME_WAITも原FAILとして残す。成功の3bootとこの追加失敗2bootを混同しない。

正常終了はQEMU消滅だけでは判定しない。元guest power request/boot identity・init shutdown/unmount・QMP guest SHUTDOWNを要求し、故障注入のSIGKILLと区別する。録画は720×960の元QMP frameと実時刻を保持し、加工scene・固定された偽出力・速度変更を使わない。

## 4. backup / restoreの対象表

| 対象 | 含む範囲 | 静止・整合 | 新しい復元先の確認 |
| --- | --- | --- | --- |
| OS A/B/data | 3disks、元署名・profile・状態 | guest正常停止、filesystem検査、全disk hash | boot前3disks完全一致、復元boot正常停止 |
| Hub/Wallet/backend | 保存job、原request/receipt、全schema/typed rows/追加table | 全writer停止fence、コピー前後照合 | 151-byte成果、合成Wallet98.97、hold0、月額未同意 |
| Game/outbox/receipt | 独立A/B/index、epoch、原grant/receipt、未確定状態の契約検査 | authority current-copy DONE→OSコピー途中実停止 | 同intent再開、epoch一度だけ、A10units一度、Bgrant0、元端末fence |
| 設定・資格・C registry | 原設定・認証・接続・所有記録 | 同じhostの停止copy、private0700/0600 | identity/schema/rowid/固定cells保持。backup暗号化なし |
| source/lock/手順 | 全1364Git source、692native、Buildroot legal/info、3config、同梱guide | 署名manifest/hash、再生成9file完全一致 | host/guest706members size/mode/hash一致 |

保存した19fileは1,074,564,436 bytesでhostに保持し、所有VM通常削除後にも全hashを再照合した。復元は同じ所有VMの新しい端末名へ行うcurrent-copyのみ。過去状態への巻戻しや別host/別VMへのimportは未対応。host exportは保全用であり、VM削除後の新規環境への復元機能を主張しない。

## 5. 残課題と判定

- Cの成功8正常bootと追加失敗2正常closeを区別して全原本を回収済み。媒体QA・最終追加local回帰・案内の集計を追記する。
- 製品LICENSEは未確定、legal.statusはNOT_CLEARED。298filesのlicense/source資料を収集したことを新しい許諾としない。
- GitHub private draft386171909から実取得し、別空環境への導入まで確認した。匿名release/asset GETは404であり、一般公開URLではない。
- 既存Sites projectの取得はNOT_FOUND。以前の本人限定scopeを変更せず、別public Siteを勝手に作成していない。
- Game接続は1時間、期限後の新しい接続は未対応。元要求の再照合・完了履歴は保持する。Game料金は本番未定。ATM自社徴収0と区別する。
- US配列英数字/記号の入力が対象で、日本語IME・本文貼付けは未接続。同梱日本語sampleの実処理を確認した範囲。
- Wallet同期中のGame遷移が無視される場合があり、Hub経由の入口で進めた。初回Game応答不明は既存更新で元要求を回収した。新しい購入で解消したことにしない。
- 人の操作時間削減・需要・収益・7日再利用は未実証。内部PC機械処理とOS操作の記録を区別する。

最終判定は全入力を集計してから追記する。期限の到来や版名で合格へ変更しない。
