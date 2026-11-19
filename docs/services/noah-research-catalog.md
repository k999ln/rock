# Noah — 世界Agent調査のカタログ取込

- 本人が言う一言: 「ここにあるものまず全てnoahのagentとして入れて」
- Goal: 指定調査チャットの保存済み全候補をNoahで検索・閲覧する。Agent本体、判定待ち、関連資産を区別する。
- Noaがつなぐもの: 出典snapshot、安定した配布元URL/ID、既存Anicca詳細と私有Agent一覧。
- AMCの工程: snapshot固定→件数/hash照合→URL/ID統合→分類→検索索引と詳細生成→timeline/詳細表示。
- Jevの合格条件: 入力全件を取込台帳で照合、再生成差分0、同一URLの重複0、未検証の実行可能表示0、全件ページングで欠落/重複0、私有uploadへ変更0。
- 出力先: `/noah/agents` のtimelineと `/noah/agents/research-*` の詳細。既存Anicca IDは維持。
- Wallet: 価格不明は不明、OSSライセンスを運用費無料と扱わない。購入/契約/課金は開始しない。
- hardware profile依存: ブラウザから閲覧。実行先と接続adapterが検証されるまでは接続を準備中として表示。
- 失敗時: 読込・検索・詳細の再試行。古い検索応答を新しい検索へ混ぜない。snapshot変更時のcursorは再読込を要求。
- 記録: 調査chat ID、取得日、入力ファイルhash、元行数、統合後件数、分類、原URL、一次資料確認/実行試験の別。

## 保存・API

読み取り専用の同梱catalogを使い、本人用upload DB/権限/100件枠から分離する。入力資料は改変せず、公開出典の紹介情報だけを生成する。秘密値・実行command・ZIPは配布しない。
`GET /api/noah/catalog` は検索・分類・範囲・件数上限付きcursorで返す。索引はサーバーのみで読み、全件を初期画面へ送らない。
`GET /api/noah/catalog/[id]` は存在確認と固定snapshotの詳細ファイル参照を返す。詳細は同梱のhash別shardから読み、外部URLをサーバー側fetchしない。
名称一致だけで独立製品を統合しない。元調査の名称groupは名称groupのまま保持し、公式配布物と区別する。モデル/データセット/SDK/Tool/教材も関連資産として検索可能にし、Agent件数へ加算しない。
既存Aniccaの公式URL変更は明示aliasで同じIDへ統合。新規候補は未接続。出典リンクは「資料を見る」と表示し、接続成功・運用開始に置き換えない。
調査中の追加データは手動の再取込で反映する。自動同期や世界全体の網羅を意味しない。

## 2026-11-15 取込結果

21:21 JST時点の保存済みsnapshotを固定。紹介URL11,979件（名称group7,149）、一次metadata71,999行、一次資料review300行、概観57行、X経由3行、個別例4行、進行中追加調査529行の合計84,871参照を照合。URL/安定IDで統合後79,643件、内訳Agent本体候補85・分類確認待ち60,982・関連資産18,576。これらは独立Agent製品の種類数ではない。
取込正本は `data/noah-research-sources/manifest.json` と圧縮snapshot。`python3 scripts/import-noah-research.py` で同じ索引・詳細を生成し、`--check` は変更せず一致を検証する。詳細は64分割、固定revisionは `d6b6ff93b7d5bcb5`。旧生成物はworkへバックアップして置き換える。新しい調査の再取込は同scriptの `--capture` を明示実行する。
検索APIは`q`（200文字）、`kind`（all/agent/candidate/related/各関連分類）、`order`（recommended/latest）、`limit`（1〜50）、`cursor`。cursorはsnapshot/検索条件へ結び、古い条件は400で再読込。分類は現時点の資料に基づき、提供者の公開日不明のものへ架空の日付を付けない。
ローカルHTTPでAgent候補85件を5ページで取得し、ID重複0、検索→詳細→出典を確認。関連13試験・typecheck/lint・build・verify:design成功。Chromeで検索、関連資産18,576件への切替、20件から40件への追加読込、320px幅表示を確認。全体検証の結果・既存問題はtask 61に残す。
