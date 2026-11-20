import { NoahAgentError } from './noah-agent-upload.ts';
import { noahDigest } from './noah-execution.ts';
import { LIMITS, validArtifactName } from './noah-execution-contract.mjs';
import { NOAH_DATA_POLICY, type NoahDataResult, type NoahContribution } from './noah-result-data-contract.ts';

type DB = Pick<D1Database, 'prepare'>;
type ContributionRow = { id: string; state: 'active' | 'revoked'; created_at: number; revoked_at: number | null; request_sha256: string; snapshot: string | null; source_sha256: string; policy_version: string };
type WorkRow = { id: string; revision: number; payload: string };
function fail(message: string, status = 400): never { throw new NoahAgentError(message, status); }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const present = (row: ContributionRow): NoahContribution => ({ id: row.id, state: row.state, createdAt: row.created_at, revokedAt: row.revoked_at });
const returned = "json_extract(payload,'$.noahExecution.state')='returned' AND json_type(payload,'$.noahExecution.result')='object'";

export function noahDataOperatorAllowed(owner: string, configured?: string): boolean {
  try {
    const ids: unknown = JSON.parse(configured ?? '[]');
    return Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256) && ids.includes(owner);
  } catch { return false; }
}

/** Only output fields cross this boundary. Work title, prompt, runtime keys and identity do not. */
export async function readNoahDataResult(payload: string): Promise<NoahDataResult> {
  const job: unknown = JSON.parse(payload);
  const execution = object(job) && object(job.noahExecution) ? job.noahExecution : null;
  if (!execution || execution.state !== 'returned' || !object(execution.result)) fail('受け取った成果がありません。仕事の状態を確認してください。', 404);
  const result = execution.result;
  if (typeof execution.agentId !== 'string' || execution.agentId.length > 300 || typeof execution.version !== 'string' || execution.version.length > 200 || typeof execution.completedAt !== 'string' || !Number.isFinite(Date.parse(execution.completedAt)) || execution.completedAt.length > 40 || typeof result.text !== 'string' || !Number.isSafeInteger(result.exitCode) || !Array.isArray(result.files) || result.files.length > LIMITS.files || byteLength(JSON.stringify(result)) > LIMITS.resultBytes) fail('成果の形式を確認できません。仕事を開いて確認してください。', 409);
  const files: NoahDataResult['files'] = [], names = new Set<string>();
  let total = 0;
  for (const file of result.files) {
    if (!object(file) || typeof file.name !== 'string' || !validArtifactName(file.name) || names.has(file.name) || typeof file.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || Number(file.bytes) < 0 || Number(file.bytes) > LIMITS.fileBytes) fail('成果ファイルを確認できません。仕事を開いて確認してください。', 409);
    const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    total += bytes.length;
    if (bytes.length !== file.bytes || total > 65536 || digest !== file.sha256) fail('成果ファイルが一致しません。仕事を開いて確認してください。', 409);
    names.add(file.name);
    files.push({ name: file.name, base64: file.base64, sha256: file.sha256, bytes: Number(file.bytes) });
  }
  return { agentId: execution.agentId, version: execution.version, completedAt: execution.completedAt, verification: 'host_observed_unverified', text: result.text, files, exitCode: Number(result.exitCode) };
}
function cursorFor(params: URLSearchParams, operator: boolean): [string | number, string] | null {
  const value = params.get('cursor');
  if (!value) return null;
  if (value.length > 500) fail('続きの位置を確認できません。最初から読み直してください。');
  let cursor: unknown;
  try { cursor = JSON.parse(value); } catch { fail('続きの位置を確認できません。最初から読み直してください。'); }
  if (!Array.isArray(cursor) || cursor.length !== 2 || !identifier(cursor[1]) || (operator ? !Number.isSafeInteger(cursor[0]) : typeof cursor[0] !== 'string' || cursor[0].length > 40)) fail('続きの位置を確認できません。最初から読み直してください。');
  return cursor as [string | number, string];
}
export function createNoahDataStore(db: DB, now = Date.now) {
  async function contribution(owner: string, workId: string) {
    return db.prepare('SELECT * FROM noah_result_contributions WHERE owner_id=? AND work_id=?').bind(owner, workId).first<ContributionRow>();
  }
  async function detail(owner: string, id: string, operator = false) {
    if (!identifier(id)) fail('成果を選び直してください。');
    if (operator) {
      const row = await db.prepare("SELECT * FROM noah_result_contributions WHERE id=? AND state='active'").bind(id).first<ContributionRow>();
      if (!row?.snapshot) fail('提供されている成果がありません。一覧を読み直してください。', 404);
      return { id: row.id, result: JSON.parse(row.snapshot) as NoahDataResult, sourceSha256: row.source_sha256, policyVersion: row.policy_version };
    }
    const row = await db.prepare(`SELECT id,revision,payload FROM work_jobs WHERE user_id=? AND id=? AND ${returned}`).bind(owner, id).first<WorkRow>();
    if (!row) fail('成果が見つかりません。一覧を読み直してください。', 404);
    const result = await readNoahDataResult(row.payload), shared = await contribution(owner, id);
    return { id: row.id, revision: row.revision, result, contribution: shared ? present(shared) : null };
  }
  async function list(owner: string, params: URLSearchParams, operator = false) {
    const q = params.get('q') ?? '';
    if (q.length > 80) fail('検索語が長すぎます。80文字以内で入力してください。');
    const cursor = cursorFor(params, operator), pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const table = operator ? 'noah_result_contributions' : 'work_jobs';
    const time = operator ? 'created_at' : 'updated_at';
    const path = operator ? 'snapshot' : "json_extract(payload,'$.noahExecution')";
    const textPath = operator ? '$.text' : '$.result.text', filePath = operator ? '$.files' : '$.result.files';
    const where = [operator ? "state='active'" : `user_id=? AND ${returned}`];
    const values: (string | number)[] = operator ? [] : [owner];
    if (q) { where.push(`(json_extract(${path},'$.agentId') LIKE ? ESCAPE '\\' OR json_extract(${path},'${textPath}') LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(${path},'${filePath}') f WHERE json_extract(f.value,'$.name') LIKE ? ESCAPE '\\'))`); values.push(pattern, pattern, pattern); }
    if (cursor) { where.push(`(${time}<? OR (${time}=? AND id<?))`); values.push(cursor[0], cursor[0], cursor[1]); }
    const rows = (await db.prepare(`SELECT id,${time} AS sort_time,json_extract(${path},'$.agentId') AS agentId,json_extract(${path},'$.completedAt') AS completedAt FROM ${table} WHERE ${where.join(' AND ')} ORDER BY ${time} DESC,id DESC LIMIT 21`).bind(...values).all<{ id: string; sort_time: number | string; agentId: string; completedAt: string }>()).results;
    const page = rows.slice(0, 20), last = page.at(-1);
    return { items: page.map(({ id, agentId, completedAt }) => ({ id, agentId, completedAt })), nextCursor: rows.length > 20 && last ? JSON.stringify([last.sort_time, last.id]) : null };
  }
  async function mutate(owner: string, input: unknown) {
    if (!object(input)) fail('操作の内容を確認してください。');
    if (input.action === 'revoke') {
      if (Object.keys(input).length !== 2 || !uuid(input.id)) fail('提供を選び直してください。');
      await db.prepare("UPDATE noah_result_contributions SET state='revoked',snapshot=NULL,revoked_at=? WHERE owner_id=? AND id=? AND state='active'").bind(now(), owner, input.id).run();
      const row = await db.prepare('SELECT * FROM noah_result_contributions WHERE owner_id=? AND id=?').bind(owner, input.id).first<ContributionRow>();
      if (!row) fail('提供が見つかりません。一覧を読み直してください。', 404);
      return present(row);
    }
    if (input.action !== 'share' || Object.keys(input).length !== 8 || !Object.keys(input).every(key => ['action','id','workId','workRevision','policyVersion','includeText','files','consent'].includes(key))) fail('提供の内容を確認してください。');
    if (!uuid(input.id) || !identifier(input.workId) || !Number.isSafeInteger(input.workRevision) || Number(input.workRevision) < 0 || input.policyVersion !== NOAH_DATA_POLICY || input.consent !== true || typeof input.includeText !== 'boolean' || !Array.isArray(input.files) || input.files.length > LIMITS.files || !input.files.every(name => typeof name === 'string' && validArtifactName(name)) || new Set(input.files).size !== input.files.length || (!input.includeText && !input.files.length)) fail('提供する成果と同意を確認してください。');
    const selectedNames = (input.files as string[]).slice().sort();
    const requestHash = await noahDigest(JSON.stringify({ workId: input.workId, revision: input.workRevision, policy: NOAH_DATA_POLICY, includeText: input.includeText, files: selectedNames }));
    const previous = await db.prepare('SELECT * FROM noah_result_contributions WHERE owner_id=? AND id=?').bind(owner, input.id).first<ContributionRow>();
    if (previous) {
      if (previous.request_sha256 !== requestHash) fail('同じ操作の内容は変更できません。成果を開き直してください。', 409);
      return present(previous);
    }
    const work = await db.prepare(`SELECT id,revision,payload FROM work_jobs WHERE user_id=? AND id=? AND ${returned}`).bind(owner, input.workId).first<WorkRow>();
    if (!work) fail('成果が見つかりません。一覧を読み直してください。', 404);
    if (work.revision !== input.workRevision) fail('成果が更新されています。開き直して確認してください。', 409);
    const result = await readNoahDataResult(work.payload);
    if (selectedNames.some(name => !result.files.some(file => file.name === name)) || (input.includeText && !result.text)) fail('提供する成果を選び直してください。');
    const snapshot = JSON.stringify({ ...result, text: input.includeText ? result.text : '', files: result.files.filter(file => selectedNames.includes(file.name)) });
    const sourceHash = await noahDigest(JSON.stringify(result));
    // The source fence and per-owner cap are evaluated in the same statement as the insertion.
    await db.prepare(`INSERT OR IGNORE INTO noah_result_contributions(id,owner_id,work_id,work_revision,request_sha256,source_sha256,policy_version,state,snapshot,created_at)
      SELECT ?,?,?,?,?,?,?,'active',?,? WHERE EXISTS(SELECT 1 FROM work_jobs WHERE user_id=? AND id=? AND revision=? AND payload=?)
      AND (SELECT COUNT(*) FROM noah_result_contributions WHERE owner_id=?)<10000`).bind(input.id, owner, work.id, work.revision, requestHash, sourceHash, NOAH_DATA_POLICY, snapshot, now(), owner, work.id, work.revision, work.payload, owner).run();
    const saved = await db.prepare('SELECT * FROM noah_result_contributions WHERE owner_id=? AND id=?').bind(owner, input.id).first<ContributionRow>();
    if (!saved) fail('保存できません。成果の更新、提供済みの状態、または保存件数の上限を確認してください。', 409);
    if (saved.request_sha256 !== requestHash) fail('同じ操作の内容は変更できません。成果を開き直してください。', 409);
    return present(saved);
  }
  return { list, detail, mutate };
}
