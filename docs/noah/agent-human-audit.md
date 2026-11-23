# Noah Agent の人手監査（task 127）

これは、全系列から固定 seed で 200 系列を選び、Agent の説明画面の段の図が元の道具の説明と合っているかを、人が目で確かめるための準備と集計です。ラベル付けの運用表には依存しません。カードに載っているか、`summary_ja` があるか、`listed` が 1 か、握手が L1/L2 かで母集団を絞らず、入力にある全 `families` を先に母集団へ入れます。

## 1. 入力と準備

準備に渡すのは、収集機が書き出した `noah-intake-import/1` JSON（`families`・`candidates`・`checks` の 3 配列）です。本番 D1、API、外部 Agent へは書き込みません。テストや小さな作業用の確認には、`series` 配列（各行に `id`、任意で `name`・`summary`・`listed` など）も使えます。

```sh
node scripts/noah-agent-human-audit.mjs prepare \
  --corpus work/noah-collector/import.json \
  --definitions work/noah-label-export/labels.json \
  --out work/noah-agent-human-audit/manifest.json
```

既定値は次の通りです。

- seed: `noah-task-127-series-audit-v1`
- sample: 200 系列
- 合格の下限: `ceil(200 × 0.95) = 190` 件の `match`

選び方は、系列 ID を昇順に並べる方法ではありません。`sha256(seed + NUL + familyId)` を全系列に対して計算し、その hash、同値なら ID の順で並べて先頭 200 件を取ります。seed、母集団の総数、全 ID の digest、選んだ ID、選択後の digest を manifest に保存するため、同じ入力と seed なら同じ 200 件を再現できます。母集団が 200 件未満なら、既定の準備は失敗します。`--size` を小さくした場合はプレビューであり、200 件の合格結果とは数えません。

manifest の各行には、名前・原文の短い説明・（あれば）`summary_ja`、系列・代表候補・握手の位置、`family:<id>`・`candidate:<id>`・`check:<id>` の source evidence ID が入ります。握手のない系列も除外しません。`record_json` や接続 JSON の中身は manifest に複製せず、元ファイルの JSON Pointer と digest を記録します。

`--definitions` は任意ですが、`noah-label-export/1` の `series`（`familyId`、`candidateId`、`toolsSha256`、`tools`）を渡す場合は、3 つのキーが intake の代表候補・握手の `tools_sha256` と完全一致した行だけを採用します。採用した行には `definition:<familyId>:<candidateId>:<toolsSha256>` の evidence ID と定義の digest を付けます。定義が無い、候補が変わった、道具の版が変わった系列は、母集団から外さず「定義なし」として残ります。

## 2. 人が書く judgments

人は manifest を見て、該当する説明画面を 390px 前後で開き、元の候補・握手の道具の説明と照合します。`judgments.json` は次の形です。

```json
{
  "schema": "noah-agent-human-audit/1",
  "judgments": [
    {
      "auditId": "audit:noah-task-127-series-audit-v1:family-…",
      "judgment": "match",
      "sourceEvidenceIds": ["family:family-…", "candidate:candidate-…", "check:candidate-…"],
      "definitionEvidenceIds": ["definition:family-…:candidate-…:<toolsSha256>"],
      "outputEvidenceIds": ["sha256:<画面写真ファイルのSHA-256>"] ,
      "note": "道具の入力と出力、待つ相手、本人の工程を照合した"
    }
  ]
}
```

`judgment` は `match`、`mismatch`、`unclear` のいずれかです。`sourceEvidenceIds` は、その行の manifest にある ID だけを使います。`definitionEvidenceIds` は、完全一致した tool definition の ID（定義が無い行は空配列）です。`outputEvidenceIds` は、画面写真・保存した HTML など、実際に見た出力を追える ID（推奨は `sha256:<64桁>`）です。空の ID、存在しない source/definition ID、重複した `auditId` は不正として集計から合格判定へ進めません。intake の metadata/hash だけで `match` を付けることはできません。

## 3. 集計と「合格」と言える条件

```sh
node scripts/noah-agent-human-audit.mjs score \
  --manifest work/noah-agent-human-audit/manifest.json \
  --judgments work/noah-agent-human-audit/judgments.json \
  --corpus work/noah-collector/import.json \
  --definitions work/noah-label-export/labels.json \
  --out work/noah-agent-human-audit/score.json
```

集計は、`--corpus`（省略時は manifest の source path）の JSON の SHA-256 が manifest と同じかを読み取りで確かめます。元データが無い、変わった、judgment が 200 件揃っていない、`unclear` が残っている、または evidence ID が不正な時は `claim: "not_claimed"` とし、途中までの件数を 95% 合格とは呼びません。

`--definitions`（省略時は manifest の definitions path）がある manifest では、label export の schema と SHA-256 も確かめます。`match` は、行の `definitionEvidenceIds` が空でなく、manifest の完全一致定義 ID を含み、その ID が `sourceEvidenceIds` にもある時だけ有効です。定義なしの行は `mismatch` としてのみ記録でき、`match` や `unclear` にはできません。

`claim: "pass_95_percent"` になるのは、次の全てを満たす時だけです。

1. source hash と definitions hash が一致している。
2. 200 行全てに一意な judgment がある。
3. 全行に source evidence と output evidence があり、`match` の行には版の一致した definition evidence がある。
4. 200 行全てに版の一致した definition がある。
5. `unclear` が 0 件で、`match` が 190 件以上ある。

このスクリプトは人の判断を作らず、外部 Agent を呼ばず、ラベル付けの表を読みません。`score.json` の `counts`・`invalid`・`source.status` と judgments、画面写真の digest を一緒に保存してから、PR の証拠として扱います。
