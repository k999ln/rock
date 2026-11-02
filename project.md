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
