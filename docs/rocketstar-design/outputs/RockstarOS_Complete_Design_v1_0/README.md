# RockstarOS 設計書完全版 v1.0

2026-09-24。OSとシステムソフトの設計基準書。rocketstarの製造・実飛行・有人居住の認定版ではない。

- `RockstarOS_Complete_Design_v1_0.pdf`：32章、配置・処理・権限・保存・通信・機上評価・運用・試験。
- `RockstarOS_Complete_Design_v1_0.md`：編集可能な本文。2つのSVG図を相対参照する。
- `design_catalog.json`：5配備profile、13論理サービス、地上参照ポリシー、8未入力群。
- `requirements.json/csv`：60要求と受入条件。全件の実機受入は未完了。
- `contracts/`：7型Draft 2020-12、合成例、5表の設計DDL。runtimeへ未統合。
- `sources/`：一次資料URL、元repo SHA、ローカル出典hash、過去版の場所。
- `evidence/contract_checks.json`：今回43/43の構造・DDL確認。
- `reference_c0_1/`：旧35件模型試験とそのruntime。今回の新機能試験ではない。
- `capacity_example.json`：100GiBデータ領域の仮定計算。benchmarkではない。
- `manifest.json`：配布ファイルのSHA-256。秘密鍵・実機操作資格は含まない。

## 検証を再現する場合

独立したPython 3.12環境へ `jsonschema==4.26.0` を導入し、このpackage内で `python validation/verify_contracts.py` を実行する。結果はevidence/reproduced_*.jsonへ保存し、出荷時の証拠を上書きしない。必要なDBはメモリー内だけに作る。元OS repoや実設備へ接続しない。Schemaを通過することは本人確認・署名検証・物理完了を意味しない。

元RockstarOSの読取基準SHA：5d5f3dc4f73ac3389c8dbc00f9ca6e8beba526e0。今回そのrepoへ変更を加えていない。新OS image、cFS/RTEMS build、実機driver、無線接続、飛行・居住設備は本packageに完成品として含まれない。
