# RockstarOS 完全版プロンプト集

2026-10-06 / プロンプト版1.0。担当へ渡す11本の指示文であり、設計完成・実装完成・自動実行の証拠ではない。

00で全体設計と共通契約を固め、01〜08を必要な担当へ渡す。各ファイルは単独で使える。個別設計を共通契約へ合わせ、合意した範囲を09で実装・個別受入する。完成した担当成果を10で統合し、同一候補の全体受入を行う。プロンプトを開くだけでAgentは起動しない。

| 担当・段階 | 完全版 |
| --- | --- |
| 全体設計・共通契約 | [00 全体設計](00-overall-design.md) |
| 共通Core・Sky／Zema | [01 担当別設計・引き渡し](01-common-core.md) |
| Webクライアント・入口整理 | [02 担当別設計・引き渡し](02-web-client.md) |
| SIM／eSIM・Cloud利用権 | [03 担当別設計・引き渡し](03-esim-access.md) |
| Pixel 10・物理OS | [04 担当別設計・引き渡し](04-pixel-os.md) |
| QEMU／PC Developer Preview | [05 担当別設計・引き渡し](05-qemu-pc.md) |
| avocadoMini R5 | [06 担当別設計・引き渡し](06-mini.md) |
| avokadoPro | [07 担当別設計・引き渡し](07-pro.md) |
| 余剰計算資源の共有 | [08 担当別設計・引き渡し](08-shared-compute.md) |
| 設計確定後の実装 | [09 個別実装](09-implementation.md) |
| 完成した担当成果の統合 | [10 統合・全体受入](10-integration.md) |

## 受け渡しと現在地

共通契約→個別設計→合意範囲の実装/受入→統合受入。引き渡しは設計/API/schema版、task/RQ、所有範囲、branch/SHA、migration/rollback、fixture、試験と証拠、artifact hash、残条件を含む。既存承認は保持し、新しい設計差分だけを確認する。契約・支出・署名鍵・flash・公開は各条件を維持する。

作成時mainはe22b4a69ae9e600872f2e5ae60d9d0aab28bcfe9。PR86/87統合済み、PR85/84未統合。main同一SHAのverify・秘密検査・CodeQL・Web測定・回帰成功を読み取り確認した。実行時は再取得する。[旧プロンプト](../rock-current-next-20261002.md)は履歴/契約参照として保持し、新しい設計先行指示と競合する即時実装指示は適用しない。

## 履歴参照（現在の起点ではない）

baseline.auditInputsの2026-09-09記録はmain 7cdbb5fedc86ee3978ed329d9312147d137c9199、native fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5、design de5b102d3525daccf604efd5685bdf8c14ad5d50。削除済みbranchを必須化したり、この履歴へのcheckoutを指示するものではない。
