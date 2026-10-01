# RockstarOS：接続・記憶・信頼・表示の調査台帳

調査・閲覧日：2026-09-24。以下は公開文献と公式仕様の確認であり、rockリポジトリの実装監査、製品の認証、実測ではない。

## SYS1 — 小さい端末では「定型操作」と「自由な会話」を分ける

- 公式資料：Home Assistant, *Speech-to-Phrase brings voice home*, 2025-02-13。
- URL: https://www.home-assistant.io/blog/2025/02/13/voice-chapter-9-speech-to-phrase/
- 確認箇所：Voice for the masses、Large language model improvements。
- 直接支持：限定した文型と登録機器名を使うローカル認識と、自由な発話を文字化する汎用認識を区別。単純な操作を先にローカル処理する構成を紹介。
- 限界：開発元の報告。紹介された処理時間はavocadoMiniの性能でも日本語の実測でもない。完全な会話AIと同等ではない。
- 推論：停止・音量・選択・取消は軽量な経路、自由質問・制作は別経路にする。ただし安全停止は音声認識の成功だけに依存させない。

## SYS2 — 「対応言語」を部品ごとに確認する

- 公式実装：OHF-Voice/speech-to-phrase、閲覧時READMEのSupported languages。
- URL: https://github.com/OHF-voice/speech-to-phrase
- 直接支持：登録文型を認識する方式。閲覧した対応言語一覧に日本語は記載されていない。
- 限界：Home Assistant全体が日本語非対応という意味ではない。READMEの将来更新や別実装・別モデルの可否まで否定しない。
- 推論：日本語のウェイクワード、ASR、命令理解、読み上げを個別に試験する。「多言語LLMあり」から音声操作全体の日本語対応を宣言しない。

## SYS3 — 対応機器とのローカル接続は既存標準を利用する

- 公式資料：Connectivity Standards Alliance, *Matter FAQ*。
- URL: https://csa-iot.org/all-solutions/matter/matter-faq/
- 確認箇所：local connection、multi-admin、remote accessの各設問。
- 直接支持：Matterのローカル接続と、複数プラットフォームに管理を許可するmulti-admin。離れた場所からの操作はインターネットへ接続したコントローラー等が必要。
- 限界：FAQ中の機器カテゴリー列挙を最新仕様の全対応表として使わない。認証済み機器でも機能・版・実装の差があり、すべての家電の全機能が共通になるわけではない。
- 推論：独自家電規格を一から作るより、対応する低リスク機器から機能単位で試験する。

## SYS4 — 別筐体のHubなしと、制御・無線機能なしは違う

- 公式実装資料：Home Assistant, *Matter*。
- URL: https://www.home-assistant.io/integrations/matter
- 直接支持：Matter controllerはソフトウェアの役割。Thread機器との接続にはThread border routerが必要。Thread無線対応とMatter対応は同一ではない。
- 限界：Home Assistant構成例をそのまま20cm miniに搭載できるという資料ではない。
- 推論：別Edge Hubを必須にしない場合、必要なコントローラー機能をminiへ内蔵する設計を検討する。Thread対応を製品要件にするなら、必要無線・アンテナ・通信役割・認証・熱を追加評価する。Wi-FiだけでThread機器につながるとはしない。

## SYS5 — 探し物は「最後に観測した場所」を返す課題として定義する

- 研究ベンチマーク：Ego4D, *Episodic Memory*。
- URL: https://ego4d-data.org/docs/benchmarks/episodic-memory/
- 確認箇所：Task Definition、Visual Queries。
- 直接支持：過去の一人称映像から回答が見える時間区間を探す課題、および物体が最後に見えた時点と場所を検索する課題を定義。
- 限界：装着カメラ由来の研究課題。固定式20cm端末の精度、部屋全体の現在位置、日常の探索時間短縮を証明していない。
- 推論：許可された視野・物体・期間に限定し、時刻、観測位置、確からしさを返す。未観測、遮蔽、位置変更では「不明」と答える。常時録画を必須化しない。

## SYS6 — 所有者の同意だけでは生活空間の信頼を説明しきれない

- 原著：Bernd, Abu-Salma & Frik (2020), *Bystanders' Privacy: The Perspectives of Nannies on Smart Home Surveillance*, FOCI 20。
- URL: https://www.usenix.org/conference/foci20/presentation/bernd
- 直接支持：ナニー26人・雇用する親16人への面接に基づく予備的研究。機器を選ばなかった人のプライバシーと、雇用関係の力の差を問題化。
- 限界：質的・予備的研究。全家庭の割合や日本の法的義務を推定しない。
- 推論：来客・同居者が状態を理解して止められること、記録しない選択を製品要件とする。所有者が購入した事実を、全員の撮影承認に置き換えない。

## SYS7 — セキュリティは購入後の支援まで設計する

- 公式資料：NIST IR 8259 Rev.1, *Foundational Cybersecurity Activities for IoT Product Manufacturers*, 2026-04。
- URL: https://csrc.nist.gov/pubs/ir/8259/r1/final
- 補完資料：NISTIR 8259A (2020), https://csrc.nist.gov/pubs/ir/8259/a/final
- 直接支持：メーカーが顧客のリスクを踏まえて製品のサイバーセキュリティ能力と情報提供を設計する枠組み。8259Aは機器識別、設定、データ保護、インターフェースへのアクセス、更新、状態把握の基礎を扱う。
- 限界：NISTの指針であり、本製品の認証、各国法への適合、安全停止回路の承認を意味しない。
- 推論：署名付き更新、鍵保護、権限分離、復旧、脆弱性窓口、支援終了方針を後付けにしない。具体的実装の妥当性は別途審査する。

## SYS8 — 生成物の来歴と、権利・真実性は分ける

- 公式資料：C2PA, *C2PA and Content Credentials Explainer*, 2.2版。
- URL: https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html
- 確認箇所：§2、§6、§7.2。閲覧時は上位版へのリンクも存在するため、2.2を最新版とは記さない。
- 直接支持：来歴情報を資産と結び、署名・改変検知を検証できる。来歴だけで内容の真実性を決定できず、来歴は欠落する場合もある。
- 限界：署名から著作権所有や商用利用許諾を自動認定できない。
- 推論：Asset Registryには生成元・モデル版・編集履歴と、ライセンス根拠・利用範囲・費用・本人の公開承認を別項目で記録する。

## SYS9 — 3Dデータの持ち出しを可能にする

- 公式仕様：Khronos, glTF 2.0 Specification, §2.1。
- URL: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- 直接支持：3Dコンテンツ制作ツールと実行環境間の効率的・拡張可能な配信/読み込み形式。
- 限界：形式対応だけで、ゲームロジック、物理、権利、外部ゲームへの導入、全拡張機能の互換性は揃わない。2.0を将来も最新と決めつけない。
- 推論：3Dの出力形式候補にする一方、ゲーム挙動・座標・単位・版・ライセンスは別の契約にする。

## TECH1 — 新しい空中表示研究も「通常の室内空間全域」とは別

- 原著：Kumagai et al. (2026), *Dual-Path Holographic Laser-Excited Volumetric Display*, ACM TOG 45(5),174。
- URL: https://doi.org/10.1145/3816042
- 確認範囲：出版社の索引済み要旨・本文・出版履歴。2026-06-29公開、2026-08-25訂正、2026-08-27更新。
- 直接支持：同期した二つの光学経路がXe充填領域でセンチメートル級の体積像を協調描画し、明るさと点密度を改善する実験。
- 限界：通常の部屋の空気へ自由に広がる表示、1本の20cm製品、安全な全室使用、複数の独立miniの成立を示さない。
- 推論：複数表示源の協調という方向は研究参考になるが、単体の表示体積と内蔵可能性を先に実測しなければ、1本/4本の製品値へ転用できない。

## TECH2 — 物理粒子による表示は存在するが、ゲーム内粒子と別物

- 原著：Smalley et al. (2018), *A photophoretic-trap volumetric display*, Nature553,486–490。
- URL: https://www.nature.com/articles/nature25176
- 直接支持：光で保持・移動する実粒子を照明して体積像を作る研究。
- 限界：部屋に粉体を散布して安全に全域表示する技術の証明ではない。本製品の電力・発熱・光安全・騒音・寸法の証拠でもない。
- 推論：ソフトウェア上の衝突粒子、深度計測光、可視表示の三者を分けて設計する。

## EDU1 — 粒子学習には、演出よりモデルと問いの設計が要る

- 研究者による教育研究概説：Wieman, Adams & Perkins (2008), *PhET: Simulations That Enhance Learning*, Science322,682–683。
- URL: https://phet.colorado.edu/phet-dist/publications/PhET_Simulations_That_Enhance_Learning.pdf
- 直接支持：学習者による探索、複数表現、操作変数、測定、適切な単純化を伴うシミュレーション設計を説明する。
- 限界：個別の空間機器の比較試験ではない。PhETの素材やコードの商用利用権をこの文献から判断しない。
- 推論：粒子をぶつける楽しさに、予測→条件変更→観察→説明を加える。見た目だけの結合ルールを実際の化学反応や量子計算の正確な再現と呼ばない。

## 採用しない近道

- ローカル処理だからプライバシー問題はなくなる。
- LLMが多言語だから日本語の音声経路も完成している。
- Matter対応だからすべての家電へ接続できる。
- 生成物に署名したので権利を販売できる。
- カメラで部屋を認識できるので、同じ範囲へ裸眼表示できる。
- OSで粒子を計算できるので、20cmの外観だけ決めれば製造できる。

この調査の提案は、各境界を独立にテストし、利用者に分かる失敗状態を用意することである。

