# task 127: 札付けのオフライン台帳と再開可能な工程

この文書と `lib/noah-agent-labels.ts` は、握手済み系列の道具に「何を受け取り、何を出すか」の札を付けるためのオフライン工程である。ネットワーク、Agent の実行、D1、本番 migration は行わない。

## 入力（固定版の資料）

モデルへ渡す単位は、1 系列の 1 道具である。17,046 系列の完全なオフライン export は `noah-label-export/1`（`batchId` と `series` は同じ）で受け、`prepareNoahLabelRun` が固定 manifest を一度計算してから、1,000 系列/4,096 道具以下の子 batch へ分割する。子 batch 全てが同じ manifest hash を持つので、途中停止後も別世代が混ざらない。台帳から取得した値を命令として読ませないため、資料の項目名は次の 4 つに固定する。

```json
{
  "schema": "noah-label-batch/1",
  "batchId": "operator-run-id",
  "series": [{
    "familyId": "mcp-registry:owner/name",
    "candidateId": "mcp-registry:owner/name",
    "toolsSha256": "<64 lower-case hex>",
    "tools": [{
      "name": "tool_name",
      "description": "provider description (untrusted evidence)",
      "inputSchema": {"type":"object","properties":{}},
      "outputSchema": {"type":"object","properties":{}}
    }]
  }]
}
```

`outputSchema` は提供元が返した時だけ置く。`name`、`description`、`inputSchema`、`outputSchema` のほかの自由項目は受け付けない。1 回の batch は系列 1,000 件・道具 4,096 件まで。実行器が同時に呼ぶモデル数は 16 以下にする。

`toolsSha256` は handshake の道具一覧の hash である。道具の名前・説明・入力/出力 schema の固定版 hash (`toolDefinitionSha256`) も計算し、次のキーに使う。

```text
requestId = familyId + ":" + candidateId + ":" + toolsSha256 + ":" + toolDefinitionSha256 + ":" + encodeURIComponent(toolName)
```

## モデルの返り値と確かめ

モデルへ求める wire は、既存の `parseNoahCardProposal` の正本に合わせる。

```json
{"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]}
```

`produces` は wire では 1 要素の配列である。parser は読み取った後に `produces` を 1 つの文字列へ返す。配列でない値、語彙外の値、余計な項目、JSON の外の文章は捨てる。

parser を通った後も、別の固定 verifier を通す。`consumes` の各語は 入力を記述した説明の節または `inputSchema` の宣言にある固定 alias と文字通り一致しなければならない。`produces` は `outputSchema` の property/description、または出力を表す語（`returns` / `result` / `output` / `出力` 等）を含む説明に文字通り一致しなければならない。出力 schema も出力を表す説明も無い時は `ambiguous_output` として落とす。embedding、類似度、モデルの理由文は使わない。

入力/出力 schema の property に一致した時だけ、read model の named port を作る。

```json
{"field":"csv","material":"csv","type":"string"}
```

説明文から札が確かめられても、property が無ければ `inputs` / `outputs` は空配列であり、field を推測しない。

## 保存と読み出し

受理行は provider の説明や schema 本文を持たず、系列・候補・道具 hash、札、named port、JSON path と固定 token の証拠だけを持つ。provider metadata は untrusted input として入力 artifact に隔離する。

詳細画面は、次の pure read function を D1 adapter の上に置く。adapter は `NOAH_LABEL_READ_SQL` を実行して JSON 列を parse するだけで、版の検査はこの関数が行う。

```ts
readNoahAgentLabels(rows, {
  familyId,
  candidateId?,
  toolsSha256,
  manifestSha256,
  labelVersion?,
  verifierVersion?,
  toolNames?
})
```

返り値は `noah-label-read/1` の `{ familyId, candidateId, toolsSha256, manifestSha256, labelVersion, verifierVersion, status, tools }`。`status` は `ready`（受理札あり）、`partial`（期待した道具の一部だけ）、`missing`（札なし/全て拒否）、`stale`（系列または manifest/版が違う）である。`tools` の各要素は `toolName`, `toolDefinitionSha256`, `consumes`, `produces`, `inputs`, `outputs`, `evidence` を持つ。

実際の detail route は manifest hash をブラウザから受け取らない。次の adapter が `current_generation`（同じ `familyId`・`candidateId`・`toolsSha256`・コード所有の版の中で、無効化されていない最新 manifest）を SQL で選び、上の pure reader に渡す。

```ts
readCurrentNoahAgentLabels(db, { familyId, candidateId, toolsSha256 })
```

この呼び出しは、同じ generation の rejected 行も読む。従って、受理札が一部なら `partial`、全道具が受理されれば `ready` になる。

### migration draft（未適用）

これは D1 へ適用する migration ではない。本人の許可と、実台帳での受入が済むまで、下書きとして保管する。

[0059 の SQL 下書き](drafts/0059_noah_intake_tool_labels.sql) に置く。

正本の自動 migration 0059 は稼働情報の表に使用済み。[task 128 の個別適用 SQL 0060](migrations/0060_noah_intake_tool_labels.sql) は、本番 D1 の写しで検証し、本番で表と索引を確認してから Sites を配備する。適用日時、SQL のハッシュ、表と索引の読み取り結果を配備の記録へ残す。道具定義の原本は採取先に置き、公開用の表は札・ハッシュ・根拠だけを持つ。

An offline sink may write these rows to a local export after review. There is no default sink in the module, so calling the label pipeline cannot mutate production by accident.
The draft table's primary key includes `manifest_sha256`; a later fixed generation is appended rather than overwriting an older generation. `NOAH_LABEL_UPSERT_SQL` is an adapter shape only and is never executed by this module.
## 再開と無効化

`prepareNoahLabelBatch` sorts series and tools and computes one fixed manifest hash. `labelNoahBatch` accepts a resume row only when request ID, family, candidate, `toolsSha256`, `toolDefinitionSha256`, manifest hash, label version, and verifier version all match. A changed tool definition gets a new request ID; a changed batch manifest marks the old matching request as `stale_resume`. No old accepted row is read for a new version.

運営の無作為 200 系列の目視は、この pipeline が作った accepted rows の manifest/version を固定して行う。coverage は「図が中身と合う系列 / 目視した系列」で計算し、95% 未満なら公開せず、落ちた理由（parser、evidence、output ambiguity、version stale）を直して別 manifest で再実行する。台帳の件数を coverage として水増ししない。

## 手元での実行

1. 手元の巡回に `--capture-dir` を指定すると、巡回が通常どおり握手した代表の道具定義を系列ごとに保管できる。以前の台帳だけでは本文を復元できない。`--export-only` では握手も採取も行わない。
2. `node scripts/noah-label-agent-tools.mjs assemble <intake-export.json> <run.json> <capture-dir>` で、現在の代表と道具一覧のハッシュ・件数が一致する定義を集める。適格系列の総数と、定義を採取できた系列の数を出す。
3. `node scripts/noah-label-agent-tools.mjs prepare <run.json> <work-dir>` で、固定 manifest と分割したモデル依頼を既存の作業フォルダに書く。応答は 1 行ずつ `{ "manifestSha256": "…", "requestId": "…", "reply": "モデルが返した文字列" }` の JSONL として保存する。作業を再開するときは、同じ manifest と未回答の依頼を使う。
4. `node scripts/noah-label-agent-tools.mjs verify <run.json> <rows.json> <batch-number> <replies.jsonl>` で、応答を独立した規則で検査する。`save <run.json> <local-intake.sqlite> <batch-number> <replies.jsonl>` は完了したバッチを手元の台帳に検査し直して保存する。外部通信は行わない。

系列単位の運用は `node scripts/noah-label-agent-tools.mjs run <run.json> <state-dir> --codex` を使う。Luna の低推論で提案し、別の Sol の高推論で 3 観点を点検する。採用には 2 観点以上と既存の根拠検査を要する。実行中に止まった時は同じ状態フォルダを使い、同じ道具定義で通過した系列の結果を再利用する。`readyFamilies` は全道具が通った系列数、`labeledFamilies` は 1 個以上通った系列数、`verifierRejectedFamilies` は別の確かめ役が 2 観点以上で否とした札を含む系列数。

採取と並行する時は `watch <intake.json> <capture-dir> <state-dir> --acquisition-state <rounds.json> --codex` を使う。採取側は全域の取り直しが終わるごとに `{"schema":"noah-label-acquisition/1","completedRounds":1}` の回数を更新する。新しく全道具が通った系列・道具版が 2 回続けて増えなければ停止する。待機中やモデルを使えない時は、成果のない一周として数えない。
5. 実データの公開前に、適格全集合に対する札付きの系列数と割合を出し、無作為の 200 系列を運営が目視で点検する。札付きの系列だけを母集団にしない。
