# 141 — CowAgentガイドを現行Noahへ接続

本人指示（2026-11-26）: 既存のYouTube ShortsとCowAgentガイドを入口に、Mac接続と最初の成果へ進める正常系を確認し、切れたリンクと古い手順を直す。

## 事実と境界

- YouTubeチャンネル `@noahbyavokado` のプロフィールは `/noah/guides/cowagent-mac` を案内している。2026-11-26の本番実測では、このURLは公開ページ整理後に404だった。
- CowAgent `research-25a5f6ae5d1576507f83` は、配布元を確認済みの紹介情報。Noahでの接続・実行・成果受取は未確認であり、実行対応済みとは表示しない。
- 現行のMac導入は `/noah/devices#mac`。Runnerの `noah pair` が出す一回限りのコード承認は `/noah/mac/connect`。最初の依頼と成果は、実行対応と表示されるAgentから `/noah/activity` へ進む。
- 動画再投稿、広告、検索確認の予定、認証・接続API、外部サービスへの登録・送信は変更しない。

## 合格条件

1. キャンペーン付きガイドURLが200で開き、canonicalはクエリを外したガイドURLを指す。
2. 18秒動画と日本語字幕を開ける。動画の過去画面と現在の対応範囲を区別する。
3. CowAgent詳細、Mac導入、Mac承認、実行対応Agent、実行中・成果へのリンクが現行公開経路を指す。
4. CowAgentを実行対応済みと誤表示しない。旧 `/noah/mac` と `/noah/launch` を案内しない。
5. 公開ページ許可一覧とsitemapへガイドを追加し、未知のガイド配下は404のままにする。
6. 対象試験、型、lint、全体 `npm run verify` の結果と本番公開確認をPRへ記録する。

## 状態

[PR #111](https://github.com/iceiceice999/rock/pull/111)で実装。対象16試験は成功。GitHub Actions、マージ、本番公開は継続中。
