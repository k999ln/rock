# Product / UX

## 目的

AIネイティブOSの上で、SkyでToolを選び、ZemaでAIチームへ依頼し、仕事・生活・Game／IPの成果へつなぐ一つの体験を作る。各端末で実際に使える能力を表示し、利用者の不便削減で判断する。

## 現在地

- 対外的にはハードウェア製品を主役にし、最初の構想をavocadoMiniとする。OS・LLM・Sky／Zemaはその中核技術として示す。avocadoMiniの実機と販売は未実施。
- 対外メッセージは利用者の目的と役に立つAIの発見を先に伝える。Skyで探し、Zemaで進め、Studioで試す体験とavocadoMini構想を示した後に、料金方針や内部技術を説明する。
- 無料配布を理念とし、OSは従量課金を予定する。無料配布の対象と利用量の計量・単価は未確定。Skyの現行収益連動精算と混同しない。
- RQ01〜RQ49を製品ベースへ固定済み。RQ49のMaterial Invention Coreは装置非接続sandboxを実装済み。Zema、simulation、外部ラボ、実験設備とのruntime接続は未実装。
- RQ49 Material Invention Coreの標準製品体験としてSpatial Invention Studio、四方向sensor端末`avocadoMini`、手によるdigital twin操作、差分再計算、Patent AI provenance bridgeを設計済み。別の任意XR addonではない。XR runtime、sensor rig、実機は未実装。
- Home、全画面からHomeへ戻る導線、Sky／Zema分離、Studio、Developer Preview紹介、共通visual systemを実装済み。
- Material Invention／avocadoMiniを含む全12層と7本のend-to-end flowを構成監査へ固定した。設計選択は適合、全体統合とproductionは未完了。
- 仕事作成、処理履歴、CSV、Wallet、設定への主要導線がある。
- 画面の存在は、本番provider、実機OS、一般公開の完了を意味しない。

主なtask: 設計の`AI01`とapp／OS能力の`AI05`、`R01`, `B01`, `B02`, `B05`, `HOME01`, `HOME02`, `SKY01`, `SKY10`〜`SKY15`, `WEB02`〜`WEB04`。

## 次に進める順番

1. stock Pixel上でSky／ZemaからBroker、Local AI、汎用Tool、成果再表示まで一本で接続する。
2. 再起動と失敗復旧を含め、操作時間、手作業、再利用率を既存手順と比較する。
3. モバイル、keyboard、focus、処理中navigation、状態表示の回帰を残す。
4. UI上の「利用可能」「未接続」「準備中」をruntime事実と一致させる。

## 完了条件

- 対象RQと利用者の不便が明記されている。
- 正常系だけでなく、入力不足、切断、競合、再起動後の復旧を確認している。
- 画面文言が実装済み範囲を越えて本番・実機・収益を主張しない。

## 関連資料

- [AIネイティブOS詳細設計](../ai-native-os-architecture.md)
- [Sol設計監査](../ai-native-os-design-audit.md)
- [製品ベース](../product-baseline.md)
- [全体構成監査](../system-composition.md)
- [1.0戦略](../rockstaros-1.0-strategy.md)
- [1.0構成](../rockstaros-1.0-architecture.md)
- [Chat usability](../chat-usability-20260912.md)
- [フロント機能性監査](../frontend-usability-audit-20260915.md)

## 検証

- `npm run typecheck`
- `npm run system:composition:check`
- `node --experimental-strip-types --test tests/web-route-style-contract.test.mjs tests/sky-studio-chat.test.mjs`
- 主要画面の実ブラウザ操作
