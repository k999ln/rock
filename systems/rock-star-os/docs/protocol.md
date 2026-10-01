> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# 端末・PC間プロトコル

## 試作transport

PC receiverは初期状態で `127.0.0.1:8765` だけをlistenします。Android/Cuttlefishでは `adb reverse tcp:8765 tcp:8765` により、端末側の同じportをPCへ転送します。

これは開発用です。ADB debuggingの常時有効化を製品要件にしません。

## 認証

試作は `Authorization: Bearer <token>` を使います。tokenは環境変数 `BLACKBERRYROCK_TOKEN` から読み、リポジトリやDBへ保存しません。productionでは端末ごとの鍵を使うchallenge-responseとsession keyへ変更します。

## Endpoint

### `GET /health`

認証なし。秘密情報や端末一覧を返しません。

```json
{"service":"blackberryrock-pc-receiver","status":"ok","version":"0.1.0"}
```

### `POST /v1/events`

```json
{
  "device_id": "demo-device",
  "type": "device.connected",
  "payload": {"transport": "usb"}
}
```

成功時は `201` とevent IDを返します。

### `POST /v1/jobs`

```json
{
  "device_id": "demo-device",
  "tool_id": "org.blackberryrock.hello",
  "idempotency_key": "demo-device:2026-09-08:0001",
  "input": {"name": "Noelle"}
}
```

同じ `idempotency_key` の再送は新しいjobを作らず、既存jobを `200` で返します。新規作成は `201` です。

### `GET /v1/jobs?device_id=demo-device`

対象端末のjobを新しい順に返します。試作は最大100件です。

### `PATCH /v1/jobs/{job_id}`

```json
{
  "status": "succeeded",
  "result": {"message": "hello Noelle"}
}
```

許可する状態は `pending`, `running`, `awaiting_confirmation`, `succeeded`, `failed`, `cancelled` です。試作では状態遷移規則を最小限だけ実装し、runner追加時にleaseとattemptを導入します。

## 共通エラー

```json
{
  "error": {
    "code": "invalid_request",
    "message": "device_id is required"
  }
}
```

| HTTP | code | 意味 |
| --- | --- | --- |
| 400 | invalid_json / invalid_request | JSONまたはfieldが不正 |
| 401 | unauthorized | tokenがない、または一致しない |
| 404 | not_found | job等が存在しない |
| 409 | invalid_transition | 許可されない状態遷移、または完了結果の変更 |
| 409 | idempotency_conflict | 同じ冪等性キーが異なる要求に再利用された |
| 413 | body_too_large | 1 MiB上限を超過 |
| 500 | internal_error | server内部エラー。詳細は外へ返さない |

## Versioning

- URL major versionは破壊的変更時だけ増やす。
- requestへfieldを追加する場合、古いreceiverが無視できる設計にする。
- manifestとjobには個別の `schema_version` を持たせる。
- 端末とPCは接続時に対応versionとcapabilityを交換する。
