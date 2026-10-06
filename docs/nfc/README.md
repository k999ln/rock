# RockstarOS NFCタグ（Web版）

タグへ書くデータは [rockstaros-url.txt](rockstaros-url.txt) の **URLレコード1件**。NFC Tools等で「URL/URI」を選び、ファイルの1行を貼り付けて書き込む。テキストレコード、連絡先、アプリ起動コマンドは不要。書き込んだ後、別のスマホで読み取り、RockstarOSホームと初回追加案内が開くか確認する。確認まではタグを読み取り専用にロックしない。

`node scripts/create-nfc-payload.mjs` は同じURLのNDEF URIレコードを `rockstaros-uri.ndef` に生成する。生のNDEFファイルを受け付ける書込機でのみ使う。普通のスマホ書込アプリではURL文字列を登録する方が確実。

タグはURLを保持するだけで、OS本体やアプリ本体を格納しない。対応する端末では読取時にリンクを開く操作が必要な場合がある。初回にWeb版が開いた後、iPhoneではSafariの共有から「ホーム画面に追加」、AndroidではChromeのメニューまたは画面内のインストール操作を使う。これは既存OS上のWebアプリ追加であり、端末OSの置換ではない。タグのURLはHTTPSの公開Siteを指し、オンラインでの初回表示が必要。

入口の`/?nfc=1`はPWAの同一originとroot scope内にあり、専用の別アプリは作らない。ホーム画面そのものが先に表示され、未追加時だけ案内を重ねる。追加済みのstandalone表示では案内を出さない。NFC読取が必ずインストール済みPWAを直接起動するという保証はない（端末・ブラウザのリンク処理に依存）。
