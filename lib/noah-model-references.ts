import type { NoahReleaseDependencies } from './noah-release';
import { noahModel } from './noah-model-catalog.mjs';
import { NoahAgentError } from './noah-agent-upload.ts';
export type NoahModelReference = {
  kind: 'agent' | 'work' | 'operation';
  id: string;
  label: string;
  href: string;
};
export async function noahModelReferences(
  db: NoahReleaseDependencies['db'],
  owner: string,
  model: string,
): Promise<NoahModelReference[]> {
  if (!noahModel(model))
    throw new NoahAgentError('モデルを確認してください。', 400);
  const instances = await db
    .prepare(`SELECT id,payload FROM noah_instances WHERE owner_id=? AND json_valid(payload) AND
    ((json_extract(payload,'$.removed')=0 AND json_extract(payload,'$.active.model')=?) OR json_extract(payload,'$.pending.pin.model')=?) LIMIT 201`)
    .bind(owner, model, model)
    .all<{ id: string; payload: string }>();
  const work = await db
    .prepare(`SELECT id,payload FROM work_jobs WHERE user_id=? AND json_valid(payload) AND
    ((json_extract(payload,'$.noahExecution.model')=? AND json_extract(payload,'$.noahExecution.state') IN ('queued','running','unknown')) OR
     (json_extract(payload,'$.noahOperation.binding.model')=? AND (json_extract(payload,'$.noahOperation.state') IN ('enabled','stopping') OR json_type(payload,'$.noahOperation.active')='object'))) LIMIT 201`)
    .bind(owner, model, model)
    .all<{ id: string; payload: string }>();
  if (instances.results.length > 200 || work.results.length > 200)
    throw new NoahAgentError(
      '参照先が多いため削除できません。仕事と運用を整理してください。',
      409,
    );
  return [
    ...instances.results.map((r) => {
      const p = JSON.parse(r.payload);
      return {
        kind: 'agent' as const,
        id: r.id,
        label: String(
          p.active?.name || p.pending?.pin.name || '自分のAgent',
        ).slice(0, 100),
        href: `/noah/library/${r.id}`,
      };
    }),
    ...work.results.map((r) => {
      const p = JSON.parse(r.payload),
        op = Boolean(p.noahOperation);
      return {
        kind: op ? ('operation' as const) : ('work' as const),
        id: r.id,
        label: op ? '継続運用' : '実行中・結果不明の仕事',
        href: `/noah/work/${r.id}`,
      };
    }),
  ];
}
