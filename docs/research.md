# 設計に使った一次資料

確認日: 2026-09-04（米国東部時間）。規約・API条件は変更されるため本番導入時に再確認する。

- [Sign-In with Ethereum仕様](https://eips.ethereum.org/EIPS/eip-4361): Ethereumアカウントを署名で認証する仕組み。アドレス接続だけでは署名認証にならず、実名の本人確認とも異なる。
- [ココナラ利用規約](https://coconala.com/pages/terms_user): 本人の登録・利用、認証情報、対象コンテンツへの自動応答等、外部直接取引の規定を確認。制作支援のすべてが禁止と決めつけず、具体的な操作を審査する。
- [金融庁・ファンドの登録等](https://www.fsa.go.jp/common/shinsei/fund.html): 資金を集めて収益分配する権利は集団投資スキーム持分に該当し得る。自己募集等に登録が問題になるため、名称で決めず実際の仕組みを確認する。
- [GitHub repository search API](https://docs.github.com/en/rest/search/search#search-repositories): 公開リポジトリの検索を収集コマンドに使用。レート制限、ライセンス、ソースの固定バージョンは採用時に確認。
- [Hugging Face Hub API](https://huggingface.co/docs/huggingface_hub/en/package_reference/hf_api): モデル/Spaceの探索。現在の収集コマンドは公開モデルを検索する。モデルカード・重みの利用条件は個別確認。
- [Product Hunt API](https://api.producthunt.com/v2/docs): デフォルトで商用利用は許可されず、事業利用は連絡が必要。初版の商用収集は有効化しない。

## 最初のOSS候補

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) / [MIT](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE): ローカル文字起こし。
- [Transformers.js](https://github.com/huggingface/transformers.js) / [Apache-2.0](https://github.com/huggingface/transformers.js/blob/main/LICENSE): ブラウザでモデル実行。モデルの重みは別条件。
- [Playwright](https://github.com/microsoft/playwright) / [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE): 自分の環境や許可されたページでWeb操作・検証。外部サービスの無人操作許可を意味しない。

これらは収益を生む完成品やLOOPとの公式提携ではなく、導入・統合の候補。収益性の検証は行っていない。
