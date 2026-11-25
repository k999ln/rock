# ローカル断面研修比較キット

試験計画は[docs/mii/training-study.md](../../../../../docs/mii/training-study.md)。Python3の標準ライブラリ、ブラウザ、検証用Nodeを使う。外部CDN・サービス・アカウント・課金なし。共通OSや本番を変更しない。

## 実行

以下はリポジトリ直下から。出力先はGit管理外、新しいディレクトリを指定する。既存出力は上書きしない。

```sh
python3 systems/rock-star-os/experiments/motion-parallax/training-study/study.py fixture /private/tmp/mii-study-demo
python3 systems/rock-star-os/experiments/motion-parallax/training-study/study.py analyze /private/tmp/mii-study-demo
python3 systems/rock-star-os/experiments/motion-parallax/training-study/study.py serve /private/tmp/mii-study-demo
```

`http://127.0.0.1:8765`を開く。方式・セット・問題を選び、Gen1の模擬左右スライダーを動かす。模擬であることが画面と集計に残る。終了はターミナルのCtrl+C。

実測の準備には別の空欄票を作る（購入・参加者募集は自動で行わない）。

```sh
python3 systems/rock-star-os/experiments/motion-parallax/training-study/study.py init /private/tmp/mii-study-field
```

| ファイル | 用途 |
| --- | --- |
| manifest.json | 版・固定割付・実測／fixture区分・校正／実測準備欄。nullは未測定 |
| assignments.csv | 8人、各3方式・3教材・問題順。参加者番号はくじで割り当てる |
| forms.html | 空欄の匿名紙票と翌日課題。ローカルブラウザで開いて印刷。1問・1ページ |
| answer-key.html | 進行者の採点鍵。翌日が終わるまで参加者に見せない |
| trials.csv | 192行。予定IDのみ埋め、測定欄は空欄。既存表計算かテキストで転記 |
| setup.csv | 設置・校正・撤収、人数、面積、配線、照度、精度、物理遅延等の別票 |
| facilities.csv | 匿名施設ID、次回日程、予算上限、意向、実提案、入金。全回答空欄 |
| summary.json | `analyze`でローカル集計。個人別・方式別の点数、秒、視線、ヒント、欠測、指標ごとのn付き中央値。入力SHA-256付き |

実測欄は空欄、明確に観測した0のみ`0`。CSV内の辺は`AB BC CG`など空白区切り、巡回順は`AB BC CG ...`。閉路の末尾で最初の辺を再掲してもよい。status=`complete / timeout / withdrawn / technical_failure`、deviation=`none / tracking_loss / interruption / discomfort / extra_teaching / other`。day2の`retention_hours`は該当条件終了からの実経過時間。観測源は`phone_screen / fixed_projection / live_pose / paper`、模擬は`fixture`。

施設票はnext_date_answer=`pending/date/no`、budget_answer=`pending/ceiling/none`、purchase_intent=`considering/yes/no`、proposal_status=`not_made/draft/sent/accepted/declined`。未回答は空欄。日付はYYYY-MM-DD、円は非負整数。提案送付・受諾と入金には機密を含めない証拠参照IDを付ける。予算額は購入承認ではない。

設置票の真偽は`yes/no`、未測定は空欄。複数セッションは行を追加し、`session_id`で分ける。個人名を入れない。元票は安全なローカル保存先で保持し、分析用匿名記録をGitへ入れない。生成先の`.gitignore`も全出力を除外する。

## 手持ちスマホと投影への表示

通常はlocalhost限定。手持ちスマホで同じ教材を開くときだけ、管理された同一LANで`serve ... --allow-lan`を手動指定し、PCのLANアドレスの8765へアクセスする。外部トンネルやインターネット公開は不要。LANモードも配信対象は表示教材だけで、CSV・採点鍵は配信しない。PCは有線映像出力で既存プロジェクターへつなぐ。wallとgen1で機器・投影位置・明るさ・倍率を固定する。

「表示専用画面に」で**実際のcanvas長方形**を計測してmanifestの幅・高さへ記入。これはブラウザ内の拡大表示。校正後にブラウザ倍率、投影補正、画像領域を変えない。上下の説明・ボタンは測定領域に含めない。

## 実カメラtrackerの接続契約（未実装）

今回、顔／両眼推定器は付属しない。既存の2D指先入力を使わない。実カメラのtrackerを用意し、壁中心座標の両眼中点へ校正した後、同一PCから`POST /pose`へ下記を送る。HTTPヘッダーに起動時だけ表示される`Authorization: Bearer <ephemeral token>`を付ける。トークンをGit・CSVに保存しない。

```json
{"x":0.0,"y":0.0,"z":2.0,"captured_at_ms":0,"sequence":1,"source":"live_pose"}
```

`captured_at_ms`は露光／取得時点のUNIX epoch ms（例の0は送信用ではない）。変換処理後の時刻に差し替えない。別端末なら時計対応と不確かさを実測してから接続。同一PCのlocalhostからのみ受付、Origin付きブラウザ送信不可、1024byte上限。連番増加、有限m値、100ms以下の鮮度を確認。映像・氏名は送らない。古い入力、切断は表示を停止。再接続してsequenceをリセットするときはサーバーを再起動する。

実施用modeでは準備欄を実測で満たし、実入力が届くまでGen1像を出さない。準備欄は自己申告値の検査であり、測定の真正性や製品適合を自動保証しない。模擬座標に`live_pose`と書いて実試験に使うことは禁止。`physical_accepted`と`product_goal_accepted`は本キットではfalseのまま。

## 検証

```sh
cd systems/rock-star-os/experiments/motion-parallax/training-study
python3 -m unittest -v test_study.py
node --test test_geometry.mjs
```

2026-11-23: Python14件、Node3件合格。fixture192行は8人全員比較可能・6人該当として検出し、`met_in_fixture`と表示。実参加者・実機・需要は未検証。空欄票は全測定欄を空欄で生成。`descriptive_medians`は各指標に測定がある人数nを併記した記述統計で、主要な全8人の対応比較とは区別する。

Chromeで教材切替、模擬頭位置、表示専用画面／戻る、参加者P01・翌日票の絞込み、準備欄が空のGen1像停止を確認した。印刷票の図が本文へはみ出したためviewBoxを修正し再確認。実印刷・実スマホ・実カメラ・プロジェクターは未実施。

全リポジトリの`npm run verify`は未合格。既定OpenSSLでの署名検証失敗を、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH`で解消。sandbox内のlocalhost待受EPERMを、localhost許可で再実行した後、既存`sky:a2a:workflow:test`がこの作業ツリー内の`node_modules/wrangler/bin/wrangler.js`欠落で停止した。既存テストの削除・弱体化、依存の入替えはしていない。続きは対応する依存環境を整え、同じコマンドを再実行する。`git diff --check`と追加文書の相対リンク照合は合格。

詳細ログ（Git管理外）: `/private/tmp/mii-training-repo-verify-20261123.log`、`/private/tmp/mii-training-repo-verify-openssl3-20261123.log`、`/private/tmp/mii-training-repo-verify-localhost-20261123.log`。生成した閲覧用の空欄票とfixtureはリポ内`output/mii-training-study/{blank,fixture}/`（Git管理外）。変更は既存mii作業branchに保持、commit／PR／main統合は未実施。既存の未コミット作業は保持した。
