# Noah — 限定Agentの情報を送る

- 本人が言う一言: 「限定投稿の外部送信、下書き保存、招待の期限・撤回も詰めて」
- Goal: 本人が登録したAgentの情報を、確認した宛先へ一度だけ送る。入力はAgent版・選択項目・本文・宛先。送信を伴わない下書き保存と実送信を分離する。
- Noaがつなぐもの: 既存Agent保存/限定招待、account認証、Work、Brokerの明示承認、固定送信adapter。
- AMCの工程: 固定下書き→本人の内容/宛先確認→有効期限と権利の再検査→CAS claim→送信→受付結果の記録。不明は同じ受付IDで照合。
- Jevの合格条件: 未承認/別owner/失効後の送信0、同受付IDの相手側受付1回以下、結果不明の自動再送0、原本/招待tokenの自動添付0。UIで下書き・承認・送信・照合を完了する。
- 出力先: Noah `/noah/outbox` の送信履歴。スマホでも操作可能だが、実機とcloud配備は別受入。
- Wallet: 無料と確認された送信adapterのみ有効化。有料/価格不明は既存Wallet予算の統合まで拒否し、既存価格を変更しない。無料はインフラ全体の無費用保証ではない。
- hardware profile依存: account APIを正本とする。ローカル試験ではMac/Noah/試験受信箱の起動が必要。
- 失敗時: 受付失敗と結果不明を分ける。応答消失/再起動は照合し、未発見を未送信の証明にしない。確定拒否だけ新しい承認/受付IDで再試行可能。
- 記録: Workにowner、source/invite版、送信先digest、選択内容、承認期限、各受付ID、要求/結果hash、時刻を保存。送信先credentialは記録/画面へ出さない。

## API / 状態

`GET /api/noah/outbox` は本人の履歴と利用可能な送信先、`POST` は `{id,agentId,inviteId?,targetId,recipient,fields,body}` の不変下書き保存。同じID/同内容は既存記録、内容変更は409。変更する場合は中止して新しい下書きを作る。
`GET /api/noah/outbox/[id]` は本人の記録。`POST` は `{action,revision,commandId,snapshotSha256,confirmation?}`。actionはapprove/send/reconcile/cancel。承認にはconfirmation=`noah-external-send/1`が必要。対象本文・宛先・送信器版・現在の権限を保存版に照合する。

状態はdraft → approved → sending → accepted / rejected / unknown。draft/approvedはcancel可能。unknown/sendingは同じ受付IDの結果照合のみ。確定rejectedは再承認して新しい受付IDへ進める（最大3回）。acceptedは相手の受付であり、相手による読了や二次的な業務完了を意味しない。
承認は最大10分、招待がある場合はその期限以下。送信開始時に現在のupload/manifestと招待revision/撤回/期限/宛先を照合する。送信後の照合は履歴を保ち、新たな本文送信を行わない。

## 送信器契約

運用者がserver環境の `NOAH_DELIVERY_TARGETS` にowner許可・送信先ID/名前/HTTPS endpoint・revision・credential変数名・`pricing:free`を設定する。利用者から任意URL/credentialを受け取らない。redirectは拒否し、応答サイズと時間を制限する。
`POST <endpoint>/deliveries/<attempt UUID>` に、固定payload/hashを送る。受信器は受付IDとhashを永続的に照合し、同IDの異なる内容は409、同一内容は保存済み結果だけを返す。確定拒否も墓標として残す。
`GET`同pathで受付結果を照合する。返却はschema/id/payloadSha256/status/receiptId/receivedAtを固定し、status=accepted/rejectedだけを確定結果として認める。404/timeout/不正応答はunknownを維持する。宛先変更や旧送信器へのcredential喪失時も別の送信先へ切り替えない。
原本ファイル、コード、実行入力、Work成果、招待tokenはこの送信器の対象外。Agentの名前・版と選択した説明/作者/利用条件/ライセンスに、本人が入力した本文だけを含める。対象が失効しても既に受付済みの情報は遠隔消去できない。

## 検証用受信箱と実送信

loopbackのlocal-previewでは「このMacの試験用受信箱」を表示する。独立したNode/SQLite受信器 `services/noah-delivery-receiver/server.mjs` を127.0.0.1:3110で起動し、実HTTPと永続受付を試験する。外部送信・メール配信成功とは数えない。一般環境でこの試験先を有効化しない。
実メール/外部サービス宛ての試験は本人が明示した宛先・内容に限る。新規契約・有料配備・一般公開・本番migrationは今回行わない。

背景送信は[Cloudflare公式のwaitUntil](https://developers.cloudflare.com/changelog/post/2025-08-08-add-waituntil-cloudflare-workers/)で応答後も短時間実行する。永続Workを先にclaimし、[最長30秒の延長](https://developers.cloudflare.com/workers/platform/limits/)に収まる送信時間を設定する。中断時は結果不明として照合し、waitUntilを永続queueや一般Agentの常時稼働と同一視しない。
