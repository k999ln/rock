# 70 旧Noah・Sky画面の統合

[PR #320](https://github.com/k999ln/rock/pull/320)

2026-11-18 本人指示: 旧Noah/Skyの機能を現在のNoahへ統合し、重複・404を修正してavoado.siへ公開する。

## 合格条件

- 公開Tool、購入、掲載/販売、担当設定、接続/端末、成果、既存クラウド設定をNoah共通ナビゲーションから開ける。
- 既知の旧URLは対応先へ遷移しqueryを保持する。未知URLを成功扱いしない。AMC循環を解消する。
- ローカル実験・認証・Broker/Wallet・DB/API境界を保持する。画面の200を購入/業務実行の成功としない。
- 回帰試験、全体verify、公開URLと主要画面のブラウザー確認を行い結果を記録する。

## 検証

- 65個の旧URL定義を正規化し、23種類の既存Skyページ実装を再利用。追加/収集、担当設定、Tool一覧は共通シェルへ接続。
- ローカルWorkerの102項目（既知URLの移動、条件保持、既存画面、未知URL404）がPASS。
- 対象48件、シェル/購入/担当26件、関連コミュニティー/掲載30件成功。全体テスト3,950件中3,946成功、失敗0、skip4。
- 全体`npm run verify`成功。型・lint成功。共通ヘッダー8種類/8ルートを本番相当Workerで確認。
- 実ブラウザーで機能一覧→Tool、PC接続ダイアログ、保存した担当への移動を確認。390px表示で横はみ出しなし。空の検証用DBで担当の読み取りが失敗する表示は公開側の認証確認と分けて扱う。
- 新規購入、投稿送信、Agent実務、Pixel/一般クラウドの受入は対象外。API/DBの移設と本番migrationは0件。
- 公開とGit保存の最終結果はPR本文および`work/verification/noah-unification-20261118/`へ記録する。

## 公開確認（2026-11-18）

- Sites v146の配備成功。`https://avoado.si`の旧URL/統合画面/ローカル実験案内/未知URL404を107項目、共通ヘッダーを8種類/8ルートで確認しPASS。
- 旧`/?source=legacy-check#sky-manage`はqueryを保持して`/noah/saved`へ移動。未ログイン時は設定作成ボタンが無効でサインイン案内を表示。購入画面は既存の「決済サービスの接続待ち」を表示し、実決済の受入とはしない。
- 基本実装SHA `56badbc9f`のPR CIは4 workflowすべて成功。公開確認で見つけたマーケット/掲載/成果/ヘルプの旧名称はNoah/Eve表記へ統一し、料金・API・保存識別子を変更しない。

## 最終公開版148（2026-11-18）

- Sites source `0dbd805f8047678b170d899ece035f9f6ee215e9`、公開版148、deployment `appgdep_6afd3be8f9688191ace49d7891d4bc93` の配備成功。`https://avoado.si/noah/features`から統合機能へ移動できる。
- 旧マーケット/購入/掲載/成果/ヘルプの表示名とリンクをNoahへ統一。表示名修正後も全体テスト3,950件中3,946成功、失敗0、skip4、型/lint/build成功。既存APIのパス保持を確認。
- 公開版の視覚確認で判明した、OS共通CSSが旧画面の暗い背景だけを白へ上書きする競合を修正。Noah内の旧機能画面に限定し、文字/背景の組合せとToolフィード固有の明るい配色を保つ。再build成功、実ブラウザーで公開マーケットと機能一覧を確認。
- 最終公開版でも107項目とヘッダー8種類/8ルートがPASS。結果と画像は`work/verification/noah-unification-20261118/public-routes-v148.json`、`public-headers-v148.json`、`public-features-v148.jpg`、`public-marketplace-v148.jpg`。
- 公開の購入画面は「決済サービスの接続待ち」。購入/販売の画面と既存処理は保持したが、実決済が可能になったという判定ではない。本人用データの更新、Agent実務、外部接続/決済はこの公開確認で実行していない。
- ソース保存先は[PR #320](https://github.com/k999ln/rock/pull/320)。Sites専用ソースへの公開であり、GitHub mainへの直接pushは行わない。

## Eveヘッダーの追加修正（2026-11-18）

- 本人の録画で、NoahからEveへ切り替えると旧3タブと別の配置へ切り替わる問題を確認。
- `ProductAppHeader`をNoah/Eveで共用し、上段をNoah/Eveの2項目に統一。コミュニティー入口はNoah内に保持。Eveの仕事/接続/設定、本人確認、処理中の移動制限を保持する。
- 既存のOS幅制限による位置のずれと、古い固定メニューの位置競合も対象を限定して修正。現在のEveタブの再選択はTool/thread等のURL状態を消さない。
- 対象24件成功。実ブラウザーでNoah→Eve→Noah、1280px幅のタブ横位置一致と390px幅の横はみ出し0を確認。
- 最初のverifyは変更したNoahシェルとHTTP検証記録のハッシュ不一致で停止。新しいローカル本番buildから8ヘッダー/8ルートを実測して記録を更新し、全体検証を再実行して成功。
- `npm run verify`成功。全体3,952件中3,948成功、失敗0、skip4。型/lint/build、Web asset closure 286件missing 0、ローカルAPI検証も成功。公開版149の配備成功。証拠は`work/verification/eve-header-20261118/`。

- Sites source `60bfbe537d8af2eea2f621a2f43a2850bd341fa4`、deployment `appgdep_6afd40e33ba8819196291c68b9770bd6`、版149。公開ブラウザーでNoah→Eve→仕事と成果→Eveタブ再選択→Noah→Eveを確認し、上段2項目・仕事queryの保持・Noah内のコミュニティー導線・本人確認の維持を確認。公開ルート107項目/共通ヘッダー8種類8ルートもPASS。
