import { workId, WorkError, type WorkJob } from './workflow.ts';
import {
  parseCompositionRecipe,
  type CompositionRecipeView,
} from './work-composition.ts';

/** Recipes remain independent metadata in existing owner-scoped work_jobs JSON. */
export function workCompositionStore(db: Pick<D1Database, 'prepare'>) {
  return {
    async recipes(user: string): Promise<CompositionRecipeView[]> {
      const rows = await db
        .prepare(`SELECT id, revision, json_extract(payload, '$.composition.recipe') AS recipe FROM work_jobs
        WHERE user_id = ? AND json_extract(payload, '$.templateId') = 'composition'
        AND json_extract(payload, '$.composition.recipe') IS NOT NULL
        ORDER BY updated_at DESC, id DESC LIMIT 100`)
        .bind(user)
        .all<{ id: string; revision: number; recipe: string }>();
      return rows.results.map((row) => {
        const value: unknown = JSON.parse(row.recipe);
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new WorkError('保存されたレシピを確認できません。');
        const recipe = value as Record<string, unknown>;
        if (
          typeof recipe.name !== 'string' ||
          !recipe.name.trim() ||
          recipe.name.length > 100 ||
          !Number.isSafeInteger(row.revision) ||
          row.revision < 0 ||
          Object.keys(recipe).some((key) => !['name', 'plan'].includes(key))
        )
          throw new WorkError('保存されたレシピを確認できません。');
        return {
          id: workId(row.id),
          jobRevision: row.revision,
          name: recipe.name,
          recipe: parseCompositionRecipe(recipe.plan),
        };
      });
    },
    async createFromRecipe(
      user: string,
      job: WorkJob,
      recipeJobId: string,
      recipeRevision: number,
    ) {
      const result = await db
        .prepare(`INSERT INTO work_jobs (id, user_id, payload, revision, updated_at)
        SELECT ?, ?, ?, ?, ? FROM work_jobs WHERE id = ? AND user_id = ? AND revision = ?
        AND json_extract(payload, '$.composition.recipe') IS NOT NULL ON CONFLICT(id) DO NOTHING`)
        .bind(
          job.id,
          user,
          JSON.stringify(job),
          job.revision,
          job.updatedAt,
          recipeJobId,
          user,
          recipeRevision,
        )
        .run();
      return result.meta.changes === 1;
    },
  };
}
