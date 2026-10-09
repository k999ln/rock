import {
  type CodeCommit,
  type CodeDraft,
  type CodeSummary,
  type CodeInspection,
  codeSourceHash,
} from './sky-code.ts';
import { SkySubmissionError } from './sky-submission.ts';
import { codeSecurityRegistry } from './sky-code-security.ts';
import { createWorkJob, applyWorkCommand } from './workflow.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Repository = {
  id: string;
  user_id: string;
  revision: number;
  head_id: string | null;
  hidden: number;
};
type Row = {
  payload: string;
  user_id: string;
  hidden: number;
  repo_revision: number;
};
function summary(row: Row, owner: string | null): CodeSummary {
  const {
    files,
    workflow: _workflow,
    inspection,
    ...commit
  } = JSON.parse(row.payload) as CodeCommit;
  const { findings: _findings, ...receipt } = inspection;
  return {
    ...commit,
    paths: files.map((f) => f.path),
    inspection: receipt,
    canEdit: row.user_id === owner,
    hidden: Boolean(row.hidden),
    repoRevision: row.repo_revision,
  };
}
export class CodeBlockedError extends SkySubmissionError {
  inspection: CodeInspection;
  constructor(inspection: CodeInspection) {
    super(
      '公開を停止しました。指摘を修正して、もう一度公開してください。',
      422,
    );
    this.inspection = inspection;
  }
}
export function skyCodeStore(db: Database, security = codeSecurityRegistry()) {
  const repository = (id: string) =>
    db
      .prepare('SELECT * FROM sky_code_repositories WHERE id = ?')
      .bind(id)
      .first<Repository>();
  const getCommit = async (id: string) => {
    const row = await db
      .prepare('SELECT payload FROM sky_code_commits WHERE id = ?')
      .bind(id)
      .first<{ payload: string }>();
    return row ? (JSON.parse(row.payload) as CodeCommit) : null;
  };
  return {
    providers: security.providers,
    async list(owner: string | null, mine = false): Promise<CodeSummary[]> {
      const rows = await db
        .prepare(`SELECT c.payload, r.user_id, r.hidden, r.revision AS repo_revision
        FROM sky_code_repositories r JOIN sky_code_commits c ON c.id=r.head_id
        WHERE ${mine ? 'r.user_id = ?' : 'r.hidden = 0'} ORDER BY r.updated_at DESC, r.id LIMIT 50`)
        .bind(...(mine ? [owner] : []))
        .all<Row>();
      return rows.results.map((row) => summary(row, owner));
    },
    async detail(id: string, owner: string | null, revision?: number) {
      const repo = await repository(id);
      if (!repo || (repo.hidden && repo.user_id !== owner))
        throw new SkySubmissionError(
          'コードが見つからないか、非公開です。',
          404,
        );
      const row = await db
        .prepare(
          `SELECT payload FROM sky_code_commits WHERE repo_id = ? AND ${revision === undefined ? 'id = ?' : 'revision = ?'}`,
        )
        .bind(id, revision === undefined ? repo.head_id : revision)
        .first<{ payload: string }>();
      if (!row)
        throw new SkySubmissionError('コードの版が見つかりません。', 404);
      const commit = JSON.parse(row.payload) as CodeCommit;
      const rows = await db
        .prepare(
          'SELECT payload FROM sky_code_commits WHERE repo_id = ? ORDER BY revision DESC LIMIT 100',
        )
        .bind(id)
        .all<{ payload: string }>();
      return {
        commit,
        parent: commit.parentId ? await getCommit(commit.parentId) : null,
        history: rows.results.map((r) =>
          summary(
            {
              ...r,
              user_id: repo.user_id,
              hidden: repo.hidden,
              repo_revision: repo.revision,
            },
            owner,
          ),
        ),
        canEdit: repo.user_id === owner,
        hidden: Boolean(repo.hidden),
        repoRevision: repo.revision,
      };
    },
    async publish(owner: string, draft: CodeDraft) {
      const repo = await repository(draft.repoId);
      if (repo && repo.user_id !== owner)
        throw new SkySubmissionError(
          '所有者と現在の版を確認してください。',
          409,
        );
      const existing = await getCommit(draft.id);
      if (existing) {
        if (
          repo?.user_id === owner &&
          existing.repoId === draft.repoId &&
          existing.revision === draft.expectedRevision + 1 &&
          existing.sourceSha256 === (await codeSourceHash(draft)) &&
          existing.inspection.provider === draft.protector
        )
          return existing; // Lost response: return the same immutable receipt; never republish a hidden repo.
        throw new SkySubmissionError('このコミットIDは使用済みです。', 409);
      }
      if (
        (repo?.revision ?? 0) !== draft.expectedRevision ||
        (!repo && draft.expectedRevision !== 0)
      )
        throw new SkySubmissionError(
          '別の画面で更新されています。最新の版を開き直してください。',
          409,
        );
      const previous = repo?.head_id ? await getCommit(repo.head_id) : null;
      if (
        draft.protector !== (previous?.inspection.provider ?? 'spider') &&
        !draft.protectionChangeConfirmed
      )
        throw new SkySubmissionError(
          '保護の変更と検査範囲を確認してください。',
        );
      const inspection = await security.inspect(draft);
      if (inspection.status === 'blocked')
        throw new CodeBlockedError(inspection);
      const createdAt = Date.now();
      let workflow = createWorkJob({
        id: draft.id,
        title: 'Skyコードの公開',
        templateId: 'sky-code-publication',
      });
      workflow = applyWorkCommand(
        workflow,
        {
          id: crypto.randomUUID(),
          action: 'record',
          stepId: 'publish',
          tool: 'sky-code-publication',
          transport: 'browser',
          sample: false,
          outcome: 'passed',
          durationMs: 0,
        },
        workflow.revision,
      );
      workflow = applyWorkCommand(
        workflow,
        {
          id: crypto.randomUUID(),
          action: 'complete',
          note: '本人指定の保護条件と一般公開の同意を検証。Tool実行許可・安全保証ではない。',
        },
        workflow.revision,
      );
      const commit: CodeCommit = {
        id: draft.id,
        repoId: draft.repoId,
        revision: draft.expectedRevision + 1,
        parentId: repo?.head_id ?? null,
        title: draft.title,
        author: draft.author,
        description: draft.description,
        message: draft.message,
        license: draft.license,
        files: draft.files,
        sourceSha256: inspection.sourceSha256,
        inspection,
        workflow,
        createdAt,
      };
      const payload = JSON.stringify(commit);
      const results = await db.batch([
        db
          .prepare(`INSERT INTO sky_code_repositories (id,user_id,revision,head_id,hidden,updated_at)
          SELECT ?,?,0,NULL,0,? WHERE ?=0 AND (SELECT COUNT(*) FROM sky_code_repositories WHERE user_id=?) < 20
          ON CONFLICT(id) DO NOTHING`)
          .bind(draft.repoId, owner, createdAt, draft.expectedRevision, owner),
        db
          .prepare(`INSERT INTO sky_code_commits(id,repo_id,revision,parent_id,payload,created_at)
          SELECT ?,id,revision+1,head_id,?,? FROM sky_code_repositories
          WHERE id=? AND user_id=? AND revision=? AND (SELECT COUNT(*) FROM sky_code_commits WHERE repo_id=?)<100`)
          .bind(
            draft.id,
            payload,
            createdAt,
            draft.repoId,
            owner,
            draft.expectedRevision,
            draft.repoId,
          ),
        db
          .prepare(`UPDATE sky_code_repositories SET revision=revision+1,head_id=?,hidden=0,updated_at=?
          WHERE id=? AND user_id=? AND revision=? AND EXISTS(SELECT 1 FROM sky_code_commits WHERE id=? AND repo_id=? AND revision=?)`)
          .bind(
            draft.id,
            createdAt,
            draft.repoId,
            owner,
            draft.expectedRevision,
            draft.id,
            draft.repoId,
            draft.expectedRevision + 1,
          ),
      ]);
      if (
        Number(results[1].meta.changes) !== 1 ||
        Number(results[2].meta.changes) !== 1
      )
        throw new SkySubmissionError(
          '更新が競合したか、保存上限（20コード・各100コミット）に達しました。最新の版を確認してください。',
          409,
        );
      return commit;
    },
    async hide(owner: string, id: string, expectedRevision: number) {
      const result = await db
        .prepare(`UPDATE sky_code_repositories SET hidden=1,revision=revision+1,updated_at=?
        WHERE id=? AND user_id=? AND revision=? AND hidden=0`)
        .bind(Date.now(), id, owner, expectedRevision)
        .run();
      if (Number(result.meta.changes) !== 1)
        throw new SkySubmissionError(
          '所有者と現在の公開状態を確認してください。',
          409,
        );
    },
  };
}
