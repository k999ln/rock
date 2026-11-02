# mii 設計作業の再開メモ

2026-11-02 / MAT15・OS10・MINI01/02 / 主担当 ROCK。
既存の全task台帳は [保存済み台帳](archive/root-snapshot-20261029/project.md)、現行の機械可読進捗は [data/project-status.json](data/project-status.json)。本書は今回の設計作業だけを記録し、全taskを複製しない。

- 着手: 最新GitHub main `7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6`から独立branch `codex/mii-prototype-design-20261102`を作成。共有dirty作業木は保持。
- 本人の回答「osの中身は一緒」を設計の中心とし、仕事・保存・権限・予算・再開を共通OSへ集約する。
- 構成判断: 最新mainのTower＋別Hubと従来の単体携帯条件は併記。今回の回答から筐体/表示条件の撤回を推定しない。
- 作業: 共通OS境界、試作用部品・接続・電力、受入記録、部品提供相談資料を既存 `docs/mii/design/` の14〜17章へ保存。Hubの45W/73W、4 Nodeの2.5GbE集約、IR dutyの不一致を訂正・未受入として明示。
- 検証: project:update、baseline:check、design:check、相対リンク18文書、計算照合、diff --checkは合格。全verifyは最終exit0（3597件中3593成功/0失敗/4skip、build、Web assets264/欠落0、API1678、CSV/mission/work/bot合格）。初回localhost制限、再試行の依存解決2件失敗、独立依存配置後の合格を区別して記録。詳細は `data/mii-prototype-design-validation.json`。
- 文書保存: 独立branchへlocal保存。GitHub保存・main統合・実機試験・公開・購入・申請送信は未実施。

次の一件（W1更新）: 18章の選定部品と現物/board版を照合→P0bの入力選択/停止/保存→P1aの単体capture。projector型番、端末内日本語ASRの可用性、Pi初期Wi-Fi/SSH、Node adapter、2台同期は未解決。製品pinout・電池・光学・実機・製造は未受入。

再現コマンド: `npm run project:update`、`npm run baseline:check`、`npm run design:check`、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。全ログはGit外 `/private/tmp/mii-design-verify-final.log`、hashと要約はvalidation JSON。実browserの操作・実声/手・実光学の受入を今回追加したものではない。

## 実機配線の具体化（2026-11-02）

本人依頼で共通OSを保持し、型番/端子と組立配線を具体化する。提示画像でMacBook Pro 14-inch（2024年11月）/M4/16GB/macOS Sequoia15.7.4を確認。個体シリアルと画像はGitへ保存しない。P0はこのMacをhost、P1は必要に応じて外付けsensor Nodeとして設計。最終筐体・表示4条件・実機未受入を維持する。公式資料で型番/connector/電源を確認し、BOM・配線図・通電前手順・未実装adapterを同期する。

- 設計判断: Mac＋BRIO 500 960-001493のP0b、Pi 5 4GB＋SC0715のP1aを選定。P1aは1台のfree-running capture用で、2台同期P1bや4 Tower完成ではない。公式製品名/variantを注文照合キーにし、未確認SKUは作らない。
- 作成: 18章、機械可読BOM（14点/9接続）、reportlab再生成source、A3横3ページのPDF。公式資料18系列を照合。最終3ページをrenderして文字/線/表の重なりがないことを確認。
- 残作業: 現物受領とW-A01〜04、Node capture adapter、A01等の実入力/保存/復旧、projector型番と光学条件。購入/OS書込/実通電/外部連絡/公開は行っていない。

- W1検証完了: `npm run project:update`、全`npm run verify`はexit0（3597件中3593成功/0失敗/4skip、Web assets264/欠落0、API1678、CSV385、mission/work/bot合格）。BOM14点/9接続の本文一致、19文書の相対リンク欠落0、PDF3ページの抽出/目視、帯域計算、diff checkを確認。要約/文書hashは `data/mii-prototype-wiring-validation.json`、全ログはGit外 `/private/tmp/mii-wiring-verify.log`。
- 保存区分: 本作業branchで文書・生成sourceをlocal保存。PDFはGit外の再生成artifact。GitHub保存・main統合は未実施。

## mii本体HW1（2026-11-02・着手）

本人の訂正を受け、18章W1はMacを使う開発用検証装置と明示し、本体設計の完成から除外する。本体は現行構造の4 Tower＋専用Hub＋差替表示部。共通OSの仕事/権限/保存は維持し、組立可能なモジュールと配線・機構・電力を19章へ具体化する。製品目標との差、光学4条件、未実装adapter、未実機受入を明記する。外部購入・契約・問い合わせ・端末書込は実施しない。

- HW1設計判断: OAK-D Pro W PoE A00574、Teensy 4.1＋I2S mic×2/SEN0623/SE/温度をTowerへ、USW-Flexのbt入力からcamera/controlへ分配。AGX Orin 64GB Dev Kit＋1TB SSDを専用Hub、4本を10GbE集約、TK710STiへDP→HDMI出力。全31 BOM行・12ネット・14接続系統、6枚の図面を作成。
- 次の作業（W1再開メモより優先）: HW-A01受領/導通確認、HW-A05試験firmware、共通OS adapter。同じ仕事の実入力/停止/保存復旧へ進む。元の小型寸法/120Hz/8ch同期/radar TDM/C-01携帯/C-02表示は未受入。
- 検証開始: `python3 docs/mii/design/body-hw1/check.py`の静的整合はPASS。PDF6ページをrenderして全頁目視、全体図の線を別配線として分離。repository全verifyはこの後に実行し、物理試験とは別記する。

- 追加指示: 「RockstarOS｜通信・Web・運用」とmii通信設計を照合。20章と通信BOMに有線WANのUSB31000S/J33を追加し、LTE/IoT SIM・Wi-Fi AP・日米衛星・offline/費用・携帯C-01を保持。印刷図は全7枚。実radio/provider/可搬coreは未受入。
- 初回全verifyは既存Eveモデルtoolkitのchild PIDファイル読取り競合で1件失敗（空文字のint変換）。本体変更とは別に記録し、該当テスト単独と全体再試行で再現性を確認する。ログ `/private/tmp/mii-body-verify.log` を保持。

- HW1最終検証: 全 `npm run verify` exit0（root3597件中3593pass/0fail/4skip、Web assets264/欠落0、API1678、CSV385、build/mission/work/bot合格）。初回Eve子PID競合→該当単独pass→全体passを別記。最後のMCU着脱socket追記は静的照合・PDF再生成/該当頁目視・metadata/design/link/diff再照合で確認。詳細は `data/mii-body-hardware-validation.json`。
- 保存: `codex/mii-prototype-design-20261102`へlocal保存。PDFはGit外の再生成artifact、source/BOM/設計書はGit対象。GitHub保存・main統合・購入・開通・通電・OS/firmware書込は未実施。

## 可搬mii P2（2026-11-02・着手）

本人指示でLTE・Wi-Fi・衛星の型番/端子と、取り外して単体通信する本体の電源・ドック配線を具体化する。共通OS契約を維持し、可搬側に演算/保存/本人性/通信/電池を配置する。HW1のTowerセンサー4本へOSを複製せず、固定側の演算は任意の拡張とする設計を検討。通信機能の型番選定と回線契約/開通/実機受入を分け、購入・無線送信・端末書込は行わない。

- P2判断: Pi4B 4GBを可搬Core、PiSugar3 Plus電池、Waveshare17693/SIM7080G＋FXP14、内蔵Wi-Fi、RockBLOCK9704-ANTを選定。12 BOM行・11接続・9論理ネット、全7頁PDFとhardware profileを追加。共通OSは同じ契約。C-01は構成選定済・物理未受入へ進め、固定AGXはP2で任意workerとする。
- 残条件: P2 adapter/実OS受入、RF同居と日本LTE/日米衛星の条件、電源枠2.68A/USB1.0Aの実測、PSU→UPS入力最大5.2V、電池区画開放での充電、包絡/熱/持続。部品選定を送信可能・量産可能としない。次はP2-A01/02準備とadapter、同居/回線条件の確定。
- 検証中: P2静的照合PASS、PDF7頁render/全頁目視済み。再現は `python3 docs/mii/design/portable-p2/check.py`、同dir `render.py`、`npm run project:update`、`npm run design:check`、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。

- P2検証完了: 全 `npm run verify` exit0（root3597件中3593pass/0fail/4skip、build、Web assets264/欠落0、API1678、CSV385、mission/work/bot合格）。P2と既存HW1の静的照合PASS、相対リンク14文書/欠落0、PDF7頁目視（最終Wi-Fi型番追記後4頁を再確認）。詳細 `data/mii-portable-hardware-validation.json`、ログ `/private/tmp/mii-portable-verify.log`。
- 保存区分: source/BOM/設計書/要約は独立local branch、PDFはGit外。GitHub保存・main統合・購入・開通・通電・無線送信・OS書込み未実施。最終のWi-Fi型番追記/進捗metadata更新はtargeted static/design/project/diff確認で閉じ、runtimeコードは変更していない。

## 可搬mii P3（2026-11-02・着手）

本人指示で衛星/LTE/Wi-Fiの同一本体利用条件をメーカー資料・地域条件で再照合し、必要ならP2の部品/電源/配線を見直す。共通OSを保持。主担当MAT15/ROCK、MINI-08・NET01・SIM01・OS10。P2の未確認条件を再掲するだけにせず、使える構成と前提・実際の阻害要因を区別して詰める。購入/契約/問い合わせ送信/OS書込み/無線送信は実施しない。

P3最終判断: LTE/NTN共用Murata EVK（Soracom4573326593342）、BU-353N5、Waveshare UPS Module 3S＋指定12.6V2A charger＋P28A×3を選定。17 BOM行/18接続/11外部論理ネット、設計2.78A/USB1.10A。Wi-Fi/LTE/NTNは排他。日本planNT1サービス開始と当該moduleの日本NTN適合を分離。R01同居RF/R02地域適合/R03antenna/R04USB電力と受領・過渡・温度検査は未解決。共通OSは同じ、P3 BSP/adapter/実機は未受入。

電源判断の理由: SC0218公差とDDR-15G-5報告overshoot5.6%はPiSugarの上限に不整合。PiSugar/独自dock回路を除去し、メーカー3S保護/均等化/5V出力と指定chargerへ変更。P28Aの標準充電2.8A・65.2mmをkit2A/67mm未満と照合、M35Aは現行1.7A上限のため不採用。初号は監視・開放充電、閉筐体/無人充電は未受入。次は22章R01〜04の原本回答とP3-A01〜07。

P3検証: 静的配線/電力枠・既存P2照合・`npm run design:check`・`git diff --check`はPASS。6頁PDFは全頁目視済。全 `npm run verify` exit0（root3597件中3593pass/0fail/4skip、API1678、CSV385、Web assets264/欠落0）。全verify後の電源再選定/文書/図面script更新はtargeted検査で確認し、runtimeコード変更なし。詳細 `data/mii-integrated-radio-validation.json`、全ログはGit外 `/private/tmp/mii-integrated-radio-verify.log`。

保存区分: 独立local branchの設計source/BOM/profile/要約。PDFはGit外で再生成可能。GitHub保存・main統合・購入・契約・開通・通電・無線送信・OS flash未実施。次の担当は22章§7の4条件への原本回答を取り込み、§8の同一Core試験を行う。OSを再選択する必要はない。

## 可搬mii P3の調達条件再確認（2026-11-02・着手）

本人指示によりR01無線同居/R02日本NTN/R03アンテナ/R04給電を公開原本と国内販売・運用条件で再確認し、必要なら構成を再選定する。主担当MAT15/ROCK、MINI-08・NET01・SIM01・OS10。共通OSは保持。最新mainは7bbb4b27、作業起点49bb6f5e。実際の購入・契約・問い合わせ送信・実機作業は行わず、調達できる構成と未取得の許可/証拠を分ける。

### P3.1 判断変更・検証

Skyloのmodem電源断/detach制限により通常route切替でmodem OFFする前提を撤回。日本Wi-Fiの初期profileはJP/2.4GHz/20MHz/ch1〜11、RFは純正。23章でQuectel候補の端子/5V範囲とYECN028AAの225mm外形衝突を明示し、全部品調達HOLDを保持。本人が2社への技術問い合わせを承認、Quectelへ1件送信/SENT読戻し済み。その後の会社メール指定を反映し、会社送信環境の確認とSoracom会社名/部署/電話の入力は未完了。個人情報/本文はGit外。

検証: P3静的整合PASS、PDF6頁すべて表示確認、design:check PASS。npm run verifyは最初127.0.0.1待受EPERMで停止、同一検証を待受可能な環境で再実行してexit0（root3597/3593pass/0fail/4skip、API1678、CSV385、Web asset264/missing0）。ログは /private/tmp/mii-p3-review/full-verify-unrestricted.log。最終metadataはproject:update/design:check/diff/追加リンク/hashも照合済み。Soracomは返信先・本文・型番を入力済み、送信未実施。実機/回線/同居RF/日本NTN証明/最大電流は未受入。local保存、GitHub未push、main未統合。

### 会社メールへの訂正と実送信（2026-11-02）

本人が会社アドレスの綴りを訂正し、Chromeで開いた認証済みZohoを使用。Quectelへ同じ照会の再送と今後の会社返信先指定を実施し、送信済み本文と「配信済み」表示を確認。会社送信環境の確認は完了、旧アドレスのアカウント未検出は解消。Soracomの返信先も訂正済みだが、会社名・部署名・電話番号の本人回答待ちで未送信。送信本文/メールURL/連絡先はGit外に保存。共通OS・部品・配線は変更せず、技術回答待ちと調達HOLDを維持する。

会社連絡更新の検証: `npm run project:update`、`npm run design:check`、差分整合とsource hash/連絡先Git除外を確認。ハード/OSコードは変更なし、全verifyは直前P3.1のexit0を参照し、今回の連絡状態変更の検査と区別する。

Soracom送信完了: 本人の会社名・電話番号回答を反映し、部署は指定がないため「未指定」と明示。会社返信先で公式フォームを送信し、受付完了画面を確認した。2社とも技術回答待ち。Quectelの初回個人送信＋会社訂正再送とSoracomフォームの計3送信を、2社への照会として記録する。次は23章§5の回答受領・原本照合と条件が閉じた部分の配線更新。共通OS・調達HOLD・実機未受入を維持する。

## mii火災警報機能 F1（2026-11-02）

本人が火災警報器の代替機能を追加し、住宅／店舗・ビルの対象に「全部」と指定。MAT15／JOINT主担当、OS10・MINI-08・NET01。共通OSを保持し、住宅用／特定小規模施設用／一般建物用を24章へ定義。固定消防機器側の独立した検知・警報・予備電源・連動と、取り外せるmiiの読取／通知を分ける。部品／端子・完成品検定・建物設備受入は未完了、P3通信の合格へ混同しない。

最新GitHub main参照9393ed97fc0333ed3a26be49c86b87fd21254b50を読取確認。作業branchはlocal04de8646起点、remote同名branchなし、CIの新規確認は未実施。公開・購入・新たな外部問い合わせ・施工なし。次は24章F-G01〜03のOEM／対象物件条件と正式図面の照合。main統合前にはmainとの差分を同期する。

F1検証完了: project:update、baseline:check、design:check、profile/gate/リンク/JSON整合、diff checkはPASS。全verifyはOpenSSL 3を指定した最終実行でexit0（root3597件/3593pass/0fail/4skip、API1678、CSV385、Web asset264/欠落0）。初回OpenSSL環境不一致、次回の既存Eve PID読取競合と単独再試験PASSを記録し、テスト／runtimeを変更していない。詳細はdata/mii-fire-alarm-design.json、全ログはGit外。消防認定・製造・現物・施工受入はすべて未実施。

## mii後付け消防ハード F2（2026-11-02）

本人が工事不要の後付けを追加指定。MAT15／JOINTを維持し、新規建物配線・AC100V直結・天井内工事なしを要件化。25章、19行BOM・8接続、5頁PDF生成元、hardware profile、静的照合を作成。住宅用NOHMI FSKJ226系＋FSOJ001B-S→Phidgets1018_3/3060_0を評価選定。施設用S4はメーカー接続制限、ビルは完成mii head未確定。全通信同時USB給電は余裕なしでHOLD。

GitHub main9393ed97fc0333ed3a26be49c86b87fd21254b50を再読取、同名remote branchなし。作業起点33f3c533e、未push／未統合、同一SHA CI未確認。新規の問い合わせ・購入・施工なし。次はF-E01〜05、OEM完成形、対象物件のhead/base/受信機対応表。F2検証は静的19部品/8接続、PDF5頁目視、リンク・baseline・design、全verify exit0（root3597件/3593pass/0fail/4skip、API1678、CSV385、Web264/欠落0）。物理・検定・施工試験はNOT_RUN。全ログは /private/tmp/mii-fire-f2-verify.log。
