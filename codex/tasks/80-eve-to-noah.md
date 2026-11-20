# 80 担当を載せる・Eve で改良する・0 クリック

設計: docs/noah-agent-market-design.md §4.4・§4.10。先に 74・76。0 クリックは本人の確認の後（設計書 §9 の 9）。

## やること

1. Eve の担当（`sky_agent_settings`）から下書きを作る `POST /api/noah/drafts/from-eve`。由来（`eve-agent-origin`）を下書きに残す。Eve の担当の画面に「Noah に載せる」。
2. 種類＝担当の公開版を、専用の端末（雲。モデルの中継だけ）と手元（Pixel。`rock-sky-agent/1`）で動かせるようにする。コードの実行は伴わない。
3. Noah の詳細に「Eve で改良する」。本人が利用権を持つ版を元に、新しい版の下書きを Eve で作る。元の版は書き換えない。別の作者の Agent は、ライセンスが許す時だけ出す。
4. 0 クリック: `lib/sky-recipe-planner.ts` の gap が返った時、条件（無料、権限は `read_user_input`・`write_results` だけ、L2 済み、動く所が専用の端末）を満たす Agent を Noah で探し、task 74 の接続を本人の代わりに呼ぶ。つないだ物は一覧に出し、仕事の画面に「Eve がつないだ」と出す。設定で切れる。

## 変えないもの

- Eve → Noa → AMC → Jev の構造。planner は実行も課金も許可しない。
- 有料の Agent、外部への書き込み・金融の権限を持つ Agent は、0 クリックの対象にしない。
- 提供者のサーバーへ本人の入力を送る Agent は、最初の 1 回、送り先を見せて本人に聞く。

## 合格条件

- Eve で話して作った担当が、入力 0 で載り、別の本人が 1 クリックでつなぎ、専用の端末（雲）で最初の成果が出る。
- 同じ担当が Pixel で動く（既存の Pixel の受入の範囲）。
- 0 クリックで、条件を 1 つでも満たさない Agent がつながらない。つないだ記録が残り、1 タップで切れる。
- tests/eve-to-noah.test.mjs、`node --experimental-strip-types --test tests/sky-recipe-*.test.mjs`、`npm run typecheck`。
