# rocketstar / A-LINK / RockstarOS 設計資料アーカイブ

2026-09-24。利用者から `k999ln/rock` へ「漏れなく更新保存」と指定された設計成果を、生成元・台帳・図・検証記録・旧版と合わせて保存する。**現行のロケット本体設計はR1.0、44ページ・35章。** 本文と付録の保存であり、製造・実機性能・飛行の認定ではない。

| 読みたい資料 | 保存先 |
| --- | --- |
| ロケット完全版 R1.0 | [PDF](outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf) · [編集用本文](outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md) · [全付録ZIP](outputs/rocketstar_Complete_Design_R1_0_package.zip) |
| 機体の要求・接続・質量監査 | [R1.0付録案内](outputs/rocketstar_Complete_Design_R1_0/README.md) · [60要求](outputs/rocketstar_Complete_Design_R1_0/requirements.json) · [18接続](outputs/rocketstar_Complete_Design_R1_0/system_interfaces.json) |
| RockstarOS完全版 v1.0と全付録 | [PDF](outputs/RockstarOS_Complete_Design_v1_0/RockstarOS_Complete_Design_v1_0.pdf) · [本文・schema・DDL等](outputs/RockstarOS_Complete_Design_v1_0/README.md) · [ZIP](outputs/RockstarOS_Complete_Design_v1_0_package.zip) |
| コロニー向け運用OSの設計・模型 | [C0.1案内](outputs/RockstarOS_Colony_C0_1/README.md) · [ZIP](outputs/RockstarOS_Colony_C0_1_package.zip) |
| 衛星・地上受信・通信継続 | [自動接続設計PDF](outputs/A-LINK_Avokado_Auto_Connect_Design_v0.3.pdf) · [受信試作v0.4](outputs/A-LINK_Avokado_Receiver_Prototype_v0.4/README.md) |
| 洋ナシ形フィットボタン | [意匠図](outputs/Avokado_Fit_Button_v1/fit_button_concept.png) · [利用者の原画像](outputs/Avokado_Fit_Button_v1/pear_shape_reference.png) · [押し方・電源制御の設計](outputs/Avokado_Power_Button_Engineering_v1/README.md) |
| C3と旧RETURN-1の履歴 | [rocketstar C3](outputs/rocketstar_C3_package/README.md) · [全成果物](outputs/) |
| 設計の生成元と確認過程 | [work](work/) · [原本ファイル一覧・SHA-256](inventory.json) · [コピー・完全性の検証記録](verification.json) |

## 保存範囲と原本

`inventory.json`の各行が元作業場所に存在した一つのファイルに対応し、相対パス、バイト数、SHA-256を固定する。PDF、Markdown、JSON、CSV、SVG、画像、ZIP、計算・模型コード、章原稿、試験証拠、QAページ画像を元のバイト列で保持した。旧名称や重複する配布物も、履歴と配布時のまとまりを再現するため残している。

除外は機械のキャッシュと`work/os_complete_v1/qa-deps`のインストール済み第三者依存だけで、除外した全パスと理由も台帳へ記録した。SDK wheel等の小さな取得物は当時のAPI照合に使った参照物であり、このリポジトリのruntime依存として導入していない。

通常のGit軽量化方針に対し、今回は利用者の完全保存指示に基づく**設計アーカイブの例外**として、過去の配布ZIPと表示検査用PNGも保存する。build cache、OS image、認証情報は追加していない。元ファイルの改行・空白・旧絶対パスも保存対象にする。

## 現行R5との関係

**avocadoMiniの現行製品基準は[R5](../avocado-mini-r5/README.md)のまま。** 単独mini・使用時200mm以内・別Edge Hub不要という要求を維持する。今回保存するロケット、OS、ボタンの原本に含まれるE3「4本＋別Hub」の前提は、原本の設計履歴として保持し、R5へ適用しない。

OSの共通運用設計とR5専用Device Profile・adapterの統合、ボタンのR5電源系への適合は未完了。既存のOS原本PDFは今回のpackageと同一SHA-256であり、以前の「付属schema・DDL未提供」は、この保存で個別原本を受領した状態へ更新する。付録が存在することはruntime統合の完了ではない。

ロケットの帰還対象は第1段・第2段。衛星は軌道で運用する設計である。618.6t・819.7tや500kg×2、550km/53度は比較仮定を含み、採用済み性能を表さない。衛星通信は見通し・電力・経路等の成立条件が必要で、電源を入れれば屋内・地下を含めてどこでも接続できると保証していない。

## 完全性を確認する

リポジトリのルートで実行する。Python標準ライブラリーだけを使用し、ファイルを変更せずにhashと配布物のCRCを検査する。

```sh
python3 scripts/verify-rocketstar-archive.py
python3 scripts/verify-rocketstar-archive.py --git
```

元の作業場所もある場合は`--source /absolute/path/to/task`を付け、元ファイルとコピーを独立に照合できる。`--write-report`は検証記録を更新する明示オプション。

生成コードには当時の作業場所の絶対パス、macOSフォント、別のavokado資料への読取参照が残る。別環境でPDF等を再生成する際はパスと依存を調整する。保存検証が通ることを、別環境での全生成コードの実行成功と同一視しない。

GitHub保存、公開商品サイトの配備、OS imageの配布、機材購入、衛星の打上げ・実無線送信は別の作業。本更新は資料保存の範囲である。
