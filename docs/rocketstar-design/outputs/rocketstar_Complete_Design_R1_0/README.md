# rocketstar ロケット完全版設計書 R1.0

2026-09-24 / 44ページ・35章。無人の小型衛星輸送、両段回収・同機番再使用を対象とする統合システム設計。

- [rocketstar_Complete_Design_R1_0.pdf](rocketstar_Complete_Design_R1_0.pdf)：読書・共有用。目次、機能図、質量監査、各系統、製造・検証・再使用条件を収録。
- [rocketstar_Complete_Design_R1_0.md](rocketstar_Complete_Design_R1_0.md)：編集可能な本文。画像は同梱の相対パスで参照。
- [mission_profile.json](mission_profile.json)：利用者要求、選定方式、比較仮定、未設定の物理入力。
- [requirements.json](requirements.json) / [CSV](requirements.csv)：60要求、章、C3台帳、検証と必要証拠。
- [system_interfaces.json](system_interfaces.json)：18全体接続。具体的な機器・数値は未確定。
- [reference_c3/design_register.md](reference_c3/design_register.md)：既存40項目。要求固定2、方式選定6、解析仮定4、未確定28、認定0。
- [reference_c3/payload_interfaces.md](reference_c3/payload_interfaces.md)：衛星との13接続。
- [mass_audit/mass_performance.md](mass_audit/mass_performance.md) / [audit.json](mass_audit/audit.json)：独立監査。4,790項目は算術照合数。
- [sources.json](sources.json)：一次資料、ローカル基準の出典と同一性。
- [evidence/package_checks.json](evidence/package_checks.json)：文書検査。飛行・実機性能の証拠ではない。

`reference_c3`と`context`は出典の保存用。旧名称、旧絶対パス、当時の参照先を原文どおり残す。これらの旧版のリンク先を全て同梱したわけではなく、現行の採用値はR1.0本文と台帳に従う。旧C3の生成外観画像は意匠参考で、製造図や機体写真ではない。

## 到達点

機体設計の分野と追跡範囲をまとめた完全版。加工図面、実部品BOM、飛行用設定、製造・充填・点火の作業手順は未作成。構造・推進・熱・飛行・両段回収・再使用の実機証拠、運用許認可は未取得。全長やエンジンを架空の数値で確定していない。

618.6tと819.7tは計算比較値で、採用済みの打上げ質量ではない。550km・53度・500kg×2は比較仮定。質量監査の帰還横断判定は上段の説明用条件に限り、第1段帰還を含む成功判定ではない。

## 計算監査の再現

Python標準ライブラリーのみを使う。出典4ファイルを読み、監査側のreplayで生成して照合する。パッケージの任意の場所から実行する場合、`mass_audit/run_audit.py`に`--source`で`reference_c3`の絶対パスを渡す。再実行すると監査記録とreplayが更新され、配布時のmanifestとは異なるファイルになるため、作業用のコピーで実行する。

## 版の変更

C3の物理方式・意匠と未確定状態を保持し、R1.0で機体本体の各設計分野、飛行力学、資源、搭載・電装・OS接続、地上運用、整備再使用、要求・検証を統合した。OSの地上契約とボタンの設計は参照のみ。ボタン操作を飛行コマンドへ割り当てていない。

`manifest.json`は配布ファイルのSHA-256とサイズを記録する。内容の工学認定を意味しない。
