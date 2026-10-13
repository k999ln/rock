# 要望の引継ぎと設計の対応

再構成版 1.0。RQ本文は変更しない。利用者が提示したRQ01〜RQ49を全件保持し、最新mainに既にあるRQ50も落とさない。各番号の本文と後日の明示判断は[製品ベース](../product-baseline.md)と[機械可読正本](../../data/product-baseline.json)を優先する。

下記は設計を読むための対応表現で、全要求の実装・実機・本番合格を示す台帳ではない。合否は[進捗JSON](../../data/project-status.json)、phaseGates、同一artifactの証拠を使う。

## [service-experience](01-service-experience.md)

- **RQ01 製品の中心** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ02 ツール供給とOSの責任** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ03 現在開発しているツールも商品** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ04 実行方式の違いを吸収する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ07 OS標準機能は自動化の周辺へ集中する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ11 端末を持つことで減る不便を実商品の利用で検証する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ18 基本アプリをSky / Zema / Wallet / Polymarketに分離する** — Sky/Zema/Wallet/Marketの既存役割と互換routeを保持。
- **RQ19 目標駆動のブランド経営エージェントへ拡張する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ26 ホーム画面と設定アプリをOSの標準入口にする** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ28 メルカリを最初の収益経路にする** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ37 Rock StudioはSkyコードを既存ツールへ付けてTool化する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ38 製品紹介を主役にし、Developer Preview導入を案内する** — 10/10 account入口とMini/Pro/rocketstar紹介を両立。
- **RQ39 紹介ページとRock Studioのvisual systemを統一する** — 過去の外観決定を新料金・新権限へ変換しない。
- **RQ40 RockstarOS全体のvisual systemとフロント機能性を改善する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ47 si自動化チームの効率化から収益・Wallet・ファンド・ゲームへ逆算する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。

## [system-contracts](02-system-contracts.md)

- **RQ05 料金・権利・資格を混同しない** — 料金・license・利用権・BYOKを別に扱い、後日確定のaccountEntryDecisionを優先。
- **RQ06 Walletで得たお金を管理する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ08 接続・費用・停止の保証範囲** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ20 Skyの自動化収益から最大8.88 USDを回収する** — 旧888 cents成功報酬系のexecutionHoldsを維持。
- **RQ21 tob無料と接続・貢献・分配を一体化したSky Network** — Sky fee当面10%、0%への条件は最新account方針を優先。
- **RQ22 MCP接続・管理をSky本体の機能にする** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ23 実在するローカルMCPと導入・利用導線を一致させる** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ24 MCPごとの接続先を選び、対応先へ最短で接続する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ25 MCP接続を自動化ツール共通のConnectorにする** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ27 OS保全機能を設定へ実装する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ29 最低限のOS運用と公開条件を設定へまとめる** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ32 完成版を正本と本人限定Webへ同一commitで収束する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ33 汎用PAPER市場と実績更新型の自律ファンド** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ34 外部Wallet／ファンドProviderを受け入れるOS境界** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ35 Rock First-party Settlement Walletを最初のProviderにする** — 既存sandboxとsuccess-fee holdを保持。
- **RQ36 Base Mainnet USDCの本番受取レールを接続する** — 既存Base/USDC受取の本人操作・実資金gateを維持。
- **RQ41 Local Action Assistantを物理Android OSのローカルLLMにする** — Pixel試験APKとfull OS受入を区別。
- **RQ42 OS Platform Coreへ登録・承認・Wallet・更新の安全境界を入れる** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ43 正式製品名をRockstarOSへ戻し、内部識別子をdev.rockで固定する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ44 共通製品版を一元管理しminor・major更新を可能にする** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ45 運営1名による緊急保護と限定保守アクセスを設ける** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ46 運営専用の端末管理画面と永続命令キューを実装する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ48 RockstarOS CoreでSky・便利機能・ゲームを接続して発展させる** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ50 使われていないスマートフォンの計算余力をSkyで仲介する** — 最新mainの追加要望。Gridは公開/合成embedding lotとtest credits、実精算未開始。

## [product-profiles](03-product-profiles.md)

- **RQ12 現設計をOSとして稼働・検証できる最低限のベースにする** — QEMUの独立Developer Previewを保持。
- **RQ13 OSとゲームを連動しWalletとゲーム内通貨を交換する** — Game交換はATMと別adapter、実資金gateは未解除。
- **RQ14 自作ゲーム作者が組み込みやすいWallet基盤** — 作者SDK/sandboxと実資金記帳の権限を分離。
- **RQ15 ATMでRockが徴収する手数料は0** — ATMのRock手数料0だけを継承。ゲーム料金は未定。
- **RQ16 CM発表に向けて導入可能なOSにする** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ17 現段階をRockstarOS 1.0のベースとして発表し継続改善する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ49 物質同士を組み合わせて発明候補を作るMaterial Invention Coreを設ける** — 合成digital twinと外部lab実操作を分ける。

## [delivery-and-acceptance](04-delivery-and-acceptance.md)

- **RQ09 進捗はbranchと証拠を伴う** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ10 ベースを繰り返し聞き直さず改善する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ30 公開最低条件を機械判定し、完了まで追跡する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。
- **RQ31 QEMU配布候補を同一byte列の証拠へ固定する** — 既存の目的・契約・受入境界を対応章へ引き継ぐ。

## RQを増やさない今回の再構成判断

- 無料account入口、Proの80万円目標、Mini LTE option、Columbiaカードは最新mainの既存確定判断を参照する。今回新しく決めた料金やhardware仕様ではない。
- 5大学共用Sky、型付きhost app成果、署名要求eSIMは元のdirty作業候補を保持して比較する。最新main実装と混ぜず、確認後に既存要求の具体化として扱う。
- JennifferはGit表記Jennifer。[JenniferのGit正本](https://github.com/k999ln/rock/blob/d0151e892794066e1a59b5e4d1dc8863e314947f/docs/jennifer-coordination.md)を専用branchで確認し、利用者の統括窓口と裏側Zema/AMCの責任を引き継ぐ。main未統合とCI/Provider/context/検収の残条件を記録し、Jevとの同一視や新しい自律実行権を作らない。
- 新たなUX配置・状態の分類軸・実現順は再構成案。利用者が新要望を確定した履歴と区別する。
