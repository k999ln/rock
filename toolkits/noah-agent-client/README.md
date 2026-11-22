# Noahの外部Agentから利用を報告する

提供者が管理するサーバーから、登録したAgentの実行結果をNoahに送れます。`/noah/publish` で発行した開発者キーをサーバーの秘密設定に置き、登録済みAgentの詳細画面からIDを控えます。

```js
import { reportNoahAgentUsage } from './usage.mjs';

await reportNoahAgentUsage({
  noahUrl: process.env.NOAH_URL,
  developerToken: process.env.SKY_DEVELOPER_TOKEN,
  agentId: process.env.NOAH_AGENT_UPLOAD_ID,
  eventId: job.eventId,
  occurredAt: job.finishedAt,
  installationId: job.anonymousInstallationId,
  outcome: job.outcome,
  durationMs: job.durationMs,
});
```

実行終了時に、ランダムなイベントUUID（v4）、終了時刻（UTCのISO形式）、結果、計測時間（ミリ秒）をジョブと一緒に保存します。通信に失敗したら同じ値で再送できます。導入先の識別には提供者が発行した匿名IDを使います。

Noahの「利用状況」で「提供したAgent」→「Agentからの利用報告」を選ぶと件数と時間を確認できます。本人の実行を裏付ける記録や請求額は、別の集計にあります。[利用報告の仕様](../../docs/services/noah-agent-usage.md)
