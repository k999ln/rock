# avocadoMini — 工場の設計開発部門へ渡す技術依頼 R0

状態: **設計開発の見積・実現性調査へ提出可能。Mini内で使用確認済みの部品・完成機能は0。製造・通電・量産リリースは不可。**

利用者の2026-10-19の明示指示「中の回路も計算・開発し、工場へ設計を持っていける状態にする」をMAT15の新しい実行条件として扱う。R5の最低要求を落とさない。外観、同じ可搬本体、使用時200mm以内、裸眼の近距離着信表示と空中tap、本人確認、RockstarOS/Sky/Zema、米国でMini自身の双方向衛星IPから任意clientへWi-Fiを共有する能力、電話・制作・Game・生活の継続をそれぞれ独立に検証する。

## 工場に渡すもの

- [内部部品と機能の採否表](component-verdicts.md): 実在候補、現形状での除外、未選定、Mini実機受入0を明記。まずこれを読んでから部品・回路見積へ進む。
- [製品発明設計](../product-invention-r1.md): 体験、L-T仮形状、F/S代案、七つのOI受入と反証。
- [電気設計・回路境界](electrical-architecture.md): board分割、電源と安全、interface、pin表作成条件、fail-safe状態。
- [機能interface台帳](interface-register.json): 16経路の役割と、pin/電圧を確定するための証拠。現在は全pin未割当。
- [再計算可能な入力](assumptions.json)、[計算プログラム](engineering_model.py)、[計算結果](screen-results.json): 寸法・電力・質量の**ふるい分け**。実測・確定BOMではない。
- [工場への設計開発依頼書](factory-rfq.md): 受託範囲、段階別成果物、測定と停止判断。
- [保存時点の持参用ZIP](factory-handoff-r0.zip): R0保存時点の計算、R5設計と主要図を同梱したRFQ一式。以後のOS開発を含む最新版は末尾の`--with-runtime`手順で再生成する。`python3 docs/avocado-mini-r5/factory-development/make_handoff.py`で再生成し、ZIP内のSHA-256 manifestを照合する。
- [R5原本](../package/integrated_design.md): 過去の比較部品を含む。現在の採用部品表ではない。

`python3 docs/avocado-mini-r5/factory-development/engineering_model.py`で画面表示と`screen-results.json`を再生成する。入力に`Hypothesis`とある値は目標または感度仮定で、部品値や保証値へ昇格させない。

## 今の算術判断

1. L-Tの仮のReady高さ194mmから200mmまで、cup内すき間`g`、本体だけ先行する故障変位`δ`、襟の軸伸び`e`の**合計余裕は6mm**。実部品の公差・固定・封止を入れたCADはない。
2. 既製PLANET 9523 IP基板の幅75mmは、仮の本体内径72mmを**3mm超す**。その基板をL-T内へそのまま配置する発注はしない。[メーカー掲載値](https://www.iridium.com/products/planet-9523-oem-board)。
3. 二本のM65A cell最大長71mmに対する仮電池区画76mmの軸余白は**5mm**。タブ・保護・絶縁・保持を積んだpack図がないので採用不可。[cell資料](https://www.molicel.com/wp-content/uploads/Product-Data-Sheet-of-INR-21700-M65A-80153-0.1_250805.pdf)。
4. 46.8Wh公称二本から、仮の使用可能率0.8・変換効率0.9を適用した負荷側33.696Wh。衛星APを仮8W×2h使うと、残る22hへ**平均0.804W**しか配分できない。CM5典型idleの約2Wを24h常時点灯する案は落とす。[CM5 datasheet](https://datasheets.raspberrypi.com/cm5/cm5-datasheet.pdf)。8Wと24hは比較仮定であり製品公称ではない。
5. 2S cell候補の5.0〜8.4Vから[Certus 9770の9.5〜14.5V入力](https://www.iridium.com/products/iridium-certus-9770)へは昇圧が必須。converter電流・RF送信peak・熱は正式の負荷波形がなく未設計。9770の140×60×16mm・185gは光学やpackと同居する現CADがない。

## 提出の意味

この一式で工場の**設計開発担当**へ、実寸CAD、通信・光学bench、回路設計、電池pack設計、試作・認証の見積を依頼できる。完成機の部品表、承認済み回路図、ネットリスト、PCB製造データ、加工図、米国の回線契約、同一閉箱の安全試験はまだない。製造部門へ「このまま作ってください」と渡す段階ではない。

外部設計を始める前に、本体を大きくする／外付け通信を必須にする等の要求変更を工場が勝手に採用しないよう、この文書の最低要求と停止条件を契約成果物に含める。両立不能なら根拠となる実部品寸法と測定値、代替構成の差分を提出させ、OWNERが製品方針を判断する。

## RockstarOS/Eve共通runtimeを含む引継ぎ

`npm --prefix packages/rockstaros-runtime run build`の後、`python3 docs/avocado-mini-r5/factory-development/make_handoff.py --with-runtime --output /private/tmp/avocado-mini-os-engineering-handoff.zip`で、現行の回路入力と共通runtime・既存workflow依存source・bundle・ビルド時hashを同梱する。sourceがbuild後に変わっていれば作成を拒否し、先に再buildする。配布物とsourceのhash照合は製造回路/driver/実機性能の合格ではない。詳細は[共通package](../../../packages/rockstaros-runtime/README.md)、[OS接続条件](electrical-architecture.md#7-工場側のos接続と納入条件共通runtime対応)を参照する。

## 起動・MCU・試験PCBを含む引継ぎ

[実装入口](../../../systems/rock-star-os/targets/avocado-mini/README.md)にPico 2 firmware、Linux監視driver、Eve client起動、接点/LED試験基板を追加した。`make_handoff.py`へ`--native-build BUILD_DIR --native-cad CHECKED_CAD_DIR --native-overlay OVERLAY_DIR`を指定すると、現sourceとhash一致するELF/bin/UF2、ERC/DRC/整合検査済みのGerber/Excellon/netlist/位置表/SVG、未enableのoverlayを同梱する。`--with-runtime`と併用可能。製品Mini全体のpin台帳は未確定のままで、卓上キャリアの割当は別の`bench-interface.json`に保持する。試験BOMの採用品/ハーネス/機構確認と実測は未完了。製造データがあるのはこのLED試験基板で、量産Miniへの製造指示書ではない。
