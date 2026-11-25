# 135 eSIMから本人専用クラウドを使う設計と適法な犯罪予防への協力

本人指示（2026-11-25）: このチャットで合意した方針を設計書へ反映し、VS Codeでも最新の作業フォルダを表示する。

## 範囲

- 正本: docs/structure/03-esim.md §8〜10。決定はdocs/structure/07-decisions-from-minutes.mdに先に記録。
- 関連するdocs/structure/02・04、docs/services/noah-own-device.md、READMEのSIM/eSIM節へ接続・隔離・責任分担を反映。
- eSIM接続→本人・端末・利用権確認→本人専用クラウドの用意・復元→Eve／Noah利用。
- 具体的な犯罪・危害の兆候について、人の確認と法的手続き後に必要最小限の本人情報・関連記録を公的機関へ提供する方針。安全確認と提供条件の説明、誤認訂正、監査、保存期間を運用条件にする。

## 文書の合格条件

- eSIM単体では閉域・本人確認・クラウド隔離が成立しないことを明記。
- account正本、Spider読み取りのみ、Jev権限なし、Broker／Walletのgateを保持。
- si単独の犯罪認定・自動通報・包括的な情報提供を行わない。
- 提携先・対象国・提供条件・実装・実回線受入を未確定／未実施として区別。
- 本人用eSIM不要経路（task131）、既存Noahの入口、料金を保持。
- 文書の差分・リンクと既存設計チェックを確認。PRを作る場合はnpm run verify。

## 今回行わないこと

実回線発行、料金変更、providerや公的機関への連絡・契約、個人情報の収集・照合・送信、検知システムや自動通報の実装、本番配備。既存の未コミット変更を上書きしない。

## 引継ぎ

設計反映の作業。後続実装の受入条件は03 §10で、合格実績ではない。接続回線・端末適合、回線断／移行、専門家による法的確認、人の審査体制、保存期間・通知・訂正手順は残件。PR未作成。

## ローカル確認（2026-11-25）

- `npm run design:check`、`npm run repository:check`、`npm run baseline:check`、`git diff --check`: 成功。対象文書のローカルリンク先とコードフェンスも確認。
- 文書のみの変更。全体の`npm run verify`は未実行、PR作成時に実施する。
- VS Codeの既存ウインドウは`/Users/kaiya/Developer/avokado-main`を表示していたため、新しいウインドウで`/Users/kaiya/Documents/ChatGPT/avokdo`を開いた。`docs/structure/03-esim.md`の最新本文（§8〜10を含む）を画面で確認。旧フォルダのGit更新・上書きは行っていない。
