# Product / UX

## 目的

RockstarOSを「自動化を選ぶSky、依頼を扱うChat、収支を扱うWallet、OS設定」という一つの体験に保ち、機能数ではなく利用者の不便削減で判断する。

## 現在地

- RQ01〜RQ40を製品ベースへ固定済み。
- Home、全画面からHomeへ戻る導線、Sky／Chat分離、Studio、Developer Preview紹介、共通visual systemを実装済み。
- 仕事作成、処理履歴、CSV、Wallet、設定への主要導線がある。
- 画面の存在は、本番provider、実機OS、一般公開の完了を意味しない。

主なtask: `R01`, `B01`, `B02`, `B05`, `HOME01`, `HOME02`, `SKY01`, `SKY10`〜`SKY15`, `WEB02`〜`WEB04`。

## 次に進める順番

1. 代表商品を一つ選び、初見利用者がHomeから成果再表示まで進めるか測る。
2. 操作時間、失敗復旧、再利用率を既存手順と比較する。
3. モバイル、keyboard、focus、処理中navigation、状態表示の回帰を残す。
4. UI上の「利用可能」「未接続」「準備中」をruntime事実と一致させる。

## 完了条件

- 対象RQと利用者の不便が明記されている。
- 正常系だけでなく、入力不足、切断、競合、再起動後の復旧を確認している。
- 画面文言が実装済み範囲を越えて本番・実機・収益を主張しない。

## 関連資料

- [製品ベース](../product-baseline.md)
- [1.0戦略](../rockstaros-1.0-strategy.md)
- [1.0構成](../rockstaros-1.0-architecture.md)
- [Chat usability](../chat-usability-20260912.md)
- [フロント機能性監査](../frontend-usability-audit-20260915.md)

## 検証

- `npm run typecheck`
- `node --experimental-strip-types --test tests/web-route-style-contract.test.mjs tests/sky-studio-chat.test.mjs`
- 主要画面の実ブラウザ操作
