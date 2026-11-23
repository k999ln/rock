## 何をしたか

[task 128](../blob/main/codex/tasks/128-noah-ux-debug.md) の D11（検索の続き）。PR #UXAUDIT で日本語の語を英語の語幹に広げる辞書（`lib/noah-search-terms.ts`、約 100 語）を入れた後、よく頼まれる仕事の語 70 個を、本番の「すべて」1,957 件（2026-11-22 に読んだ物）に当てた。0 件だった 15 個を辞書に足した。

| 語 | 前 | 後 | 足した語幹 |
| --- | --- | --- | --- |
| プレゼン・スライド | 0 | 12 | presentation・slide・deck・powerpoint・pptx |
| 予約 | 0 | 19 | booking・reserv・appointment・schedul |
| 価格（値段） | 0 | 61 | price・pricing・cost |
| 比較 | 0 | 17 | compar・versus |
| 宿題 | 0 | 8 | homework・assignment・tutor |
| SNS | 0 | 25 | social・twitter・instagram・tiktok・linkedin・bluesky |
| 運動・ダイエット | 0 | 1・2 | exercise・fitness・workout／diet・nutrition・calorie |
| タスク | 0 | 46 | task・todo・to-do |
| メモ | 0 | 41 | note・notion・obsidian（memory には当てない） |
| 日記 | 0 | 2 | journal・diary |
| カスタマーサポート | 0 | 1 | customer support・helpdesk・customer service・support ticket |
| 電話 | 0 | 20 | phone・telephon・voip・sms |
| 占い | 0 | 2 | tarot・astrolog・horoscope（fortune には当てない） |

70 個とも 1 件以上になった。

## 確かめた事

- `tests/noah-search-words.test.mjs`（2 本）: 15 個の語が関係のある Agent に当たる・1 語に 6 個まで・小文字・メモは memory に、占いは fortune に当てない。足す前の辞書では 2 本とも落ちる。`tests/noah-search-terms.test.mjs` も通る。
- `project:check`・`lint:product`: 通った。

## 残り

- 0 件の時の画面に「英語でも探す」の案内を出す事。説明の日本語訳（task 123 の 2.6）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
