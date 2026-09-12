# Sky 特許出願アシスタント

更新日: 2026-09-12

## 目的

Sky Agent Hubに、ソフトウェア・システム発明の整理から先行技術候補の確認、特許出願書類のドラフト、提出前チェックまでを一つの画面で進める本人向けツールを追加する。特許性や登録を保証せず、法的判断と提出権限は人に残す。

## 実装範囲

1. 発明の名称、発明者・出願人候補、公開状況を確認する。
2. 技術課題、仕組み、構成とデータフロー、技術的効果、既存技術との差分を整理する。
3. 入力の具体性を100点の準備度として表示し、不足項目と公開済み警告を返す。
4. 日本語検索式とJ-PlatPat、Google Patents、Espacenet、WIPO PATENTSCOPEの入口を表示する。
5. 明示同意がある場合だけOpenAI Responses APIのweb searchを使い、JPO、INPIT、WIPO、EPOのドメインに限定して候補を調べる。
6. 明細書、請求項、要約、図面指示、提出前チェックをMarkdownの提出準備パケットとして端末へ保存する。

## データとAIの境界

- 発明内容、発明者、出願人、検索結果、ドラフトをD1、Git、Skyの実行履歴へ保存しない。
- AI調査は利用者がチェックボックスで同意した場合だけ実行する。
- OpenAIリクエストは`store: false`とし、APIキーはWorker側の`OPENAI_API_KEY`だけで扱う。
- 特許調査用モデルは`OPENAI_PATENT_MODEL`で変更でき、未指定時は`gpt-5.4-nano`を使う。
- 回答は許可ドメインのクリック可能な引用が一件もない場合に失敗とする。
- 公開番号、文献名、URLの推測や創作をプロンプトで禁止する。

## 承認ゲート

- 先行技術候補は原文確認前の候補であり、漏れを含む可能性がある。
- 請求項は保護範囲を決めるため、自動生成文をそのまま提出しない。
- ダウンロード前に、専門家レビュー前のドラフトであることを利用者が確認する。
- Skyは電子署名、本人確認、料金支払、インターネット出願ソフトの操作、特許庁への提出を行わない。
- 出願前に公開済みの可能性がある場合、公開日・内容・公開先を保存し、例外の適用可否を弁理士へ至急確認する。

## 公式入口

- [J-PlatPat](https://www.j-platpat.inpit.go.jp/)
- [特許庁 インターネット出願の概要](https://www.pcinfo.jpo.go.jp/site/4_start/0_online.html)
- [特許庁 出願手続・様式](https://www.jpo.go.jp/system/process/shutugan/pcinfo/operation/appl.html)
- [特許庁 手数料](https://www.jpo.go.jp/system/process/tesuryo/hyou.html)

## 検証

`tests/patent-assistant.test.mjs`で、ready商品登録、公開済み警告、検索入口、ドラフトの必須章、人の確認ゲート、AIの保存無効化と許可ドメイン、引用必須を検証する。全体は`npm run verify`で確認する。
