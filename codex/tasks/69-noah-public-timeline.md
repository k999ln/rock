# 69 Noahの統合タイムラインをavoado.siへ公開

[PR #319](https://github.com/k999ln/rock/pull/319)

2026-11-18本人指示: 統合タイムラインをavoado.siへ反映して公開し、Gitを更新する。

## 対象

- ニュース/Agent/通常投稿/コミュニティー投稿を一本に表示し、種別・出所・コミュニティー名を示す。
- ドメイン直下、/#timeline、/noahをNoahの入口にする。検索/分類/詳細、投稿/共有/参加への導線を維持する。
- Macの登録/管理/接続/実行/停止は明示的なMac案内へ進む。スマホからMacへの遠隔実行を実装済みと表示しない。
- 公開catalogは公開資料のみ、投稿は既存認証と専用鍵を使う。本番migration追加なし、公開範囲変更なし。

## 検証と現在地

- 共通実装のroot verify: 3,997件中3,993成功、失敗0、skip4。今回の公開ソース関連21件成功、公開ビルド成功。
- 本番用ローカルWorkerで8種類のsecurity header、manifest、service worker、icon、hash付きJSを実測。immutableな旧証拠を保全し、今回の記録をdata/web-security-response-current.jsonへ保存。
- 公開ソースの全体verify: 3,942件中3,937成功、既存Eve browser待機timeout1、skip4。該当ファイルの単独再試験は2/2成功。型/lint、design/Sky等の前段と、package/build/API等の後段はすべて成功。検証用Git履歴・同一lockfileのMini依存・既存OpenSSL 3を補完した。
- ✅ Sites v143（source `09a9f3a55e54ebb937d5a1a760a3a8703cda7104`）の配備成功。実URL `https://avoado.si/` → `/noah`、ニュース/Agent混合配信、Anicca検索→詳細→Mac案内を実ブラウザーで確認。
- 未ログインの投稿APIは401でサインイン案内を表示する。実アカウントでの投稿/フォロー送信は未実施。公開範囲・本番migrationの変更なし。
- 実投稿/新規フォローの送信、一般Agentの追加実行受入、スマホ遠隔/一般cloud/Pixelは今回の受入対象外。Noah全体task68の完了ではない。
