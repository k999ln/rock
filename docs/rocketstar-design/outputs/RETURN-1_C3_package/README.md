# RETURN-1 C3 パッケージ

2026-09-23。C1の基本方式・計算を継承し、C2の別添だけだった外観変更を本文・図・台帳に統合したC3です。製造・飛行の承認版ではありません。

最初に RETURN-1_C3_Integrated_Design_Baseline.pdf を開いてください。

- PDF / Markdown：決定した構成、機能図、質量評価、必要設計台帳。
- RETURN-1_C3_external_concept.png：画像生成による意匠図。寸法を測って製造に使わないでください。
- SVG：非縮尺の機能配置図、通信構成図、理想性能の比較図。
- design_register.md / .json / .csv：40項目の状態、必要な根拠、依存関係。
- payload_interfaces.md / .json：13件の接続条件、6件の地上試験案。
- interface_crossrefs.json：接続条件と設計台帳の対応。
- mass_study.md / .json / .py：計算の仮定・全結果・再現用スクリプト。
- image_prompt.txt / generation_record.json：参照画像、最終生成指示と修正記録。生成手段は内蔵 image_gen。
- appearance_definition.json：外観EX-01〜08と設計台帳IDの対応。
- revision_notes.md：C1/C2からの更新範囲と、文書照合の記録。
- consistency_review.md：更新前のC1/C2の文書ずれと未解決の設計項目の監査。
- SHA256SUMS：ファイルの整合確認用ハッシュ。

質量計算の再現：Python 3で mass_study.py を実行すると、同じ場所のmass_study.md/jsonを再生成します。標準ライブラリだけを使用します。計算は理想式であり、飛行経路・構造・熱・エンジンの成立確認を含みません。

旧618.6 t等は比較用の仮定です。全長、直径、推力、エンジン数、板厚、材料、熱防護、脚、製造工程を確定した意味ではありません。参照文書内のローカルパスは原本所在の記録で、他PCでは自動解決しません。

別提供のA-LINK v0.4は通信ソフトの試作です。そのテスト合格はロケット・衛星・電波通信の実証ではありません。C3はこれらの実機が存在することを主張しません。

同梱資料の参照先は manifest.json を参照してください。過去版や別プロジェクトの原本は historical_external_reference と区別し、同梱していないことを明示しています。
