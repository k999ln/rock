# 786系列の本番接続・初回受入

2026-11-23 14:10 JST時点。公開先: https://avoado.si/noah/agents/verified

## 配備した範囲

[PR #28](https://github.com/iceiceice999/rock/pull/28)をmainへ統合し、Sites 216の配備成功を確認した。main `3fcf449c26535bb0eb31d9a6034baea0dde023b1`、Sites source `8b004b2cf0bde7a74e6a2744c0259d235e81a15a`の追跡treeはともに `970fefc91be43dfc30e985c869b2f2f4b75fac05`。配備ID `appgdep_6b03c9a62ae08191bf303d26f07df7ca` は2026-11-23 05:06 UTCにsucceeded。

786系列を既存Noahの正規projectへ結び付け、本番APIがtotal=786を返す。全786系列の実行合格ではない。公開APIの接続候補30件を本番で事前確認し、5系列で実際の成果を受領した。10秒ごとの一覧取得、5件の成果確認表示、接続確認のみ15件を本番画面でも確認。

## 本番で受領した成果

| ID | Agent | 実際の確認内容 |
| --- | --- | --- |
| AG0491 | AI Car Assistant | 500 km・8 L/100 km・単価1.5から燃料費60を返した |
| AG0477 | Agentic RAG Chatbot API | 17×23の計算結果391を返した |
| AG0574 | DC Metro Transit Assistant | Metro Center / Red Lineの静的GTFS始終発時刻を返した。現在の運行保証ではない |
| AG0449 | Multi-Agent Research Paper Analysis | RAGの公開論文を検索し、arXiv ID・著者・分析結果を返した |
| AG0734 | Trailhaven AI Shopping Assistant | 架空店舗の商品検索を実行。TH-0016 / Northfork Insulated Vest / 128.99の返答とsearch_products出力が一致。実店舗・購入機能の受入ではない |

5系列とも、本番のsubmit=202、成果保存=200、同じ依頼IDの再送=200（同じ仕事）、再読込で同じ成果を確認。別の新規利用者の結果GETは404。利用者cookieや所有者情報はこの記録に含めない。

AG0495 Sobit AI Research Assistantは提供元のAuthenticationErrorを検知してfailedとなり、利用可能へ昇格しなかった。AG0476はローカルの実接続で回答不能を返し、仕事の成功には数えていない。AG0719はローカルの実接続が失敗、AG0786は対応するGradio実行入口がなく保留。

停止はAG0449でsubmit=202 → stop=200 → 再読込state=stoppedを確認した。最初の停止試験の新規依頼は1分当たりの回数制限で429となったため未実行。制限期間後に再試験した。停止はNoahの成果受領を止めるもので、提供元ですでに始まった計算の停止は保証しない。

## 利用可能表示の条件

実仕事と個別確認した入口の本番成果、同じ提供元ソース版・API定義、成功と接続確認の両方が24時間以内であること。ローカルの結果を本番DBへ注入せず、本番runtimeの仕事終了から状態を記録した。成果本文や利用者情報は公開availabilityへ入れない。失敗・定義変更・確認期限切れで表示を戻す。表示中は10秒更新、画面復帰時にも更新する。画面を閉じた後に10秒間隔のブラウザ更新は続かない。毎時・一度に2件までのメタデータ再確認は一覧要求と既存巡回に連動し、健康確認のための自動推論は行わない。

## 接続保留と継続範囲

全786系列の接続条件をdata/noah-agent-connection-assessment.jsonへ記録した。HF 155件は公開状態/API定義確認。他631件のうち16件は公式資料の個別確認、615件は自動一次選別で、個別実行試験は未完了。外部認証・契約・有料利用・ローカル実行環境の準備が必要な系列は、本番利用可能に数えない。

共有履歴・文書・実行状態や第三者への送信を確認した12 Spaceは、自動接続を保留する。追加判明したAG0553 co-scientist-public-demoは、[app.py](https://huggingface.co/spaces/sdajani/co-scientist-public-demo/blob/54e4e1d3f43bbe288eddd9807348b14e3488c379/app.py#L161)と[run_store.py](https://huggingface.co/spaces/sdajani/co-scientist-public-demo/blob/54e4e1d3f43bbe288eddd9807348b14e3488c379/app/run_store.py#L127)に共通履歴の所有者確認なしの削除入口がある。削除や履歴本文取得は実行していない。本人専用の環境・権限の分離が必要。

## 検証と引継ぎ

PR #28の全体npm run verify、提供元runtime・availability・正規URL照合・UI・DB migration検証が成功。最終head `2c9a3598e43b2b1a3cb3bbc171bd7bef4380d841`のGitHub verify、CodeQL、secrets、regressions/web-securityがすべて成功後に配備した。

追加保留の変更は同じtaskの追補PRで検証・配備する。以後の系列追加は、公開ソースの仕事入口・本人分離・必要権限を確認し、実行→保存→再読込→失敗/停止を検証してから利用可能へ進める。615件の自動一次選別の個別確認、未対応API/CLI用の隔離実行器、必要な提供元認証の接続は未完了。
