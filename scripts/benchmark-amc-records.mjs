import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { root } from './check-mission-control.mjs';
import { renderVisualization } from './sync-mission-control.mjs';

const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const mission = read('data/mission-control.json');
const project = read('data/project-status.json');
const plans = new Map(mission.taskPlans.map((plan) => [plan.taskId, plan]));
const assignments = new Map(mission.taskAssignments.map((a) => [a.taskId, a]));
const records = project.tasks.map((task) => ({
  task,
  plan: plans.get(task.id) ?? null,
  assignment: assignments.get(task.id),
}));
const childRecords = records.filter(({ task }) => task.parentTaskId);
if (!childRecords.length) throw new Error('子作業登録後に実行してください');
const cases = [];
for (const count of [records.length, 1000]) {
  const sample = Array.from({ length: count }, (_, index) => {
    if (index < records.length) return records[index];
    const source = childRecords[(index - records.length) % childRecords.length];
    return { ...source, task: { ...source.task, id: 'SYNTHETIC-' + index } };
  });
  const serialized = JSON.stringify(sample);
  JSON.parse(serialized);
  const rssBefore = process.memoryUsage().rss;
  const runs = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    const parsed = JSON.parse(serialized);
    const index = new Map(parsed.map((entry) => [entry.task.id, entry]));
    for (const record of parsed) {
      if (!index.get(record.task.id)) throw new Error('index不一致');
    }
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  cases.push({
    records: count,
    syntheticExtraRecords: Math.max(0, count - records.length),
    serializedBytes: Buffer.byteLength(serialized),
    iterations: runs.length,
    parseAndIndexMs: { minimum: runs[0], median: runs[2], maximum: runs[4] },
    processRssBeforeBytes: rssBefore,
    processRssAfterBytes: process.memoryUsage().rss,
  });
}
const htmlBytes = Buffer.byteLength(renderVisualization(mission, project));
const extraChildMeanBytes =
  childRecords.reduce(
    (sum, record) => sum + Buffer.byteLength(JSON.stringify(record)) + 64,
    0,
  ) / childRecords.length;
const payloadBudgetBytes = 800000;
console.log(
  JSON.stringify(
    {
      schema: 'amc-record-benchmark/1',
      measuredAt: new Date().toISOString(),
      inputSha256: createHash('sha256')
        .update(JSON.stringify({ mission, project }))
        .digest('hex'),
      method:
        'Node単一processでJSON読込・ID索引作成・全ID参照を5回。既存件数と合成1000件のみ。UI描画・AI推論・並列build・持続負荷は測っていない。',
      currentRecords: records.length,
      cases,
      inlinePayload: {
        currentHtmlBytes: htmlBytes,
        formatLimitBytes: 1000000,
        planningBudgetBytes: payloadBudgetBytes,
        additionalChildMeanBytes: extraChildMeanBytes,
        approximateRecordCountAtPlanningBudget:
          htmlBytes >= payloadBudgetBytes
            ? null
            : records.length +
              Math.floor(
                (payloadBudgetBytes - htmlBytes) / extraChildMeanBytes,
              ),
        basis:
          '現在の全文埋込表示形式で、同程度の子作業が増える仮定。PCの限界ではない。大きい場合は要約・分割読込が必要。',
      },
      limitations: [
        '5回の短時間測定でありp95や持続性能ではない。',
        'NodeのRSSはこの計測process全体。1 AIあたりのメモリではない。',
        '1000件は合成レコード。全taskの意味や依存の正当性の受入ではない。',
        '低空き容量のため上限探索・メモリ圧迫試験・ブラウザ目視を行わない。',
      ],
    },
    null,
    2,
  ),
);
