import { profileField } from './noah-profile-contract.ts';
import type { ResolvedRegistration, RegistrationDocument } from './noah-registration-profile.ts';
import type { WorkJob } from './workflow.ts';
import { noahPublicHttpsUrl, canonicalJson, sha256Hex } from './noah-connect-requirements.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import type { RegistrationProvider, RegistrationRecord, RegistrationState, RegistrationStatus } from './noah-registration-contract.ts';
export type ConfiguredRegistration = RegistrationProvider & { executorUrl: string };
export type RegistrationDependencies = {
  resolveProfile?: (request:Request,provider:ConfiguredRegistration,reuse:unknown)=>Promise<ResolvedRegistration>;
  db: Pick<D1Database, 'prepare'>; providers: ConfiguredRegistration[]; token?: string;
  fetcher?: typeof fetch; now?: () => number; waitUntil?: (promise: Promise<unknown>) => void;
};
type RegistrationWork = WorkJob & { noahRegistration: RegistrationRecord };
const DAY = 86400000, MAX_BODY = 8192;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message: string, status = 400): never { throw new NoahAgentError(message, status); }
function hasControl(value: string) { for (let i = 0; i < value.length; i++) { const code = value.charCodeAt(i); if (code < 32 || code === 127) return true; } return false; }
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !hasControl(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function publicUrl(v: unknown): URL {
  if (!text(v, 1000)) throw Error('Invalid registration URL');
  const url = noahPublicHttpsUrl(v, 'registration');
  if (url.search || url.hash) throw Error('Registration configuration cannot contain credential URLs');
  return url;
}
/** Invalid configuration closes the entire registry. Never infer a registration endpoint from user input. */
export function parseRegistrationProviders(raw?: string): ConfiguredRegistration[] {
  try {
    if (!raw || raw.length > 65536) return [];
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records) || records.length > 20) return [];
    const ids = new Set<string>();
    return records.map(v => {
      if (!object(v) || !identifier(v.id) || ids.has(v.id) || !text(v.name, 100) || !text(v.executorName, 100) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 || !text(v.termsVersion, 100) || !Array.isArray(v.agentIds) || !v.agentIds.length || v.agentIds.length > 100 || !v.agentIds.every(id => text(id, 200)) || !Array.isArray(v.fields) || !v.fields.length || v.fields.length > 16) throw Error('Invalid registration provider');
      ids.add(v.id);
      const providerOrigin = publicUrl(v.providerOrigin), verification = publicUrl(v.verificationUrl), terms = publicUrl(v.termsUrl), executor = publicUrl(v.executorUrl);
      if (providerOrigin.pathname !== '/' || verification.origin !== providerOrigin.origin || terms.origin !== providerOrigin.origin) throw Error('Provider origin mismatch');
      const keys = new Set<string>();
      const fields = v.fields.map(f => {
        if (!object(f) || typeof f.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(f.key) || ['constructor','prototype','__proto__'].includes(f.key) || keys.has(f.key) || !text(f.label, 80) || !['text','email','password','file'].includes(String(f.type)) || typeof f.required !== 'boolean' || !Number.isSafeInteger(f.maxLength) || Number(f.maxLength) < 1 || Number(f.maxLength) > 1024) throw Error('Invalid registration field');
        if (f.profileField !== undefined && ((!profileField(f.profileField) && f.profileField !== 'identityDocument') || f.type === 'password')) throw Error('Invalid profile mapping');
        if ((f.type === 'file') !== (f.profileField === 'identityDocument')) throw Error('Invalid document mapping');
        keys.add(f.key);
        return { key: f.key, label: f.label, type: f.type as 'text' | 'email' | 'password' | 'file', ...(f.profileField ? {profileField:f.profileField as import('./noah-registration-contract.ts').RegistrationField['profileField']} : {}), required: f.required, maxLength: Number(f.maxLength) };
      });
      return { id: v.id, name: v.name, agentIds: v.agentIds as string[], revision: Number(v.revision), providerOrigin: providerOrigin.origin,
        verificationUrl: verification.href, termsUrl: terms.href, termsVersion: v.termsVersion, executorName: v.executorName,
        executorUrl: executor.href, executorOrigin: executor.origin, fields };
    });
  } catch { return []; }
}
async function readBounded(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) fail('入力を確認してください。');
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const r = await reader.read(); if (r.done) break; length += r.value.length; if (length > MAX_BODY) { await reader.cancel(); fail('登録情報が長すぎます。入力を短くしてください。', 413); } chunks.push(r.value); }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result)) as unknown;
}
export async function registrationFingerprint(key: string, value: unknown) {
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(canonicalJson(value)))), b => b.toString(16).padStart(2, '0')).join('');
}
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
export function createNoahRegistrationApi(deps: RegistrationDependencies) {
  const now = deps.now ?? Date.now, fetcher = deps.fetcher ?? fetch;
  const enabled = typeof deps.token === 'string' && deps.token.length >= 32;
  async function read(owner: string, id: string): Promise<RegistrationWork> {
    const row = await deps.db.prepare("SELECT payload FROM work_jobs WHERE user_id=? AND id=? AND json_extract(payload,'$.templateId')='noah-registration'").bind(owner, id).first<{ payload: string }>();
    if (!row) fail('登録の仕事が見つかりません。このブラウザで始めた仕事を開いてください。', 404);
    const job = JSON.parse(row.payload) as RegistrationWork;
    if (job.noahRegistration.expiresAt <= now()) fail('確認できる期限が過ぎています。登録先で状況を確認してください。', 410);
    return job;
  }
  async function update(owner: string, job: RegistrationWork, expectedRevision: number) {
    job.revision = expectedRevision + 1; job.updatedAt = new Date(now()).toISOString();
    await deps.db.prepare('UPDATE work_jobs SET payload=?,revision=?,updated_at=? WHERE user_id=? AND id=? AND revision=?').bind(JSON.stringify(job), job.revision, job.updatedAt, owner, job.id, expectedRevision).run();
  }
  async function present(job: RegistrationWork): Promise<RegistrationStatus> {
    const r = job.noahRegistration, provider = deps.providers.find(p => p.id === r.providerId);
    const same = provider && await sha256Hex(canonicalJson(provider)) === r.providerDigest;
    return { id: job.id, providerName: r.providerName, providerOrigin: r.providerOrigin, agentId: r.agentId, state: r.state, expiresAt: r.expiresAt,
      verificationUrl: same && r.state === 'needs_user' ? provider.verificationUrl : null,
      returnTo: `/noah/launch?${new URLSearchParams({ agent: r.agentId })}#library` };
  }
  async function callAgent(provider: ConfiguredRegistration, id: string, values?: Record<string, string>, documents?:Record<string,RegistrationDocument>): Promise<RegistrationState> {
    try {
      const response = await fetcher(provider.executorUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.token}`, 'Idempotency-Key': id }, body: JSON.stringify({ action: values ? 'register' : 'status', id, providerId: provider.id, providerOrigin: provider.providerOrigin, termsVersion: provider.termsVersion, ...(values ? { values, ...(documents && Object.keys(documents).length ? {documents} : {}) } : {}) }) });
      if (!response.ok) { await response.body?.cancel(); return 'unknown'; }
      const reply = await readBounded(response.body);
      if (!object(reply) || reply.id !== id || !['running','needs_user','completed','failed','unknown'].includes(String(reply.state))) return 'unknown';
      return reply.state as RegistrationState;
    } catch { return 'unknown'; }
  }
  async function settle(owner: string, job: RegistrationWork, state: RegistrationState) {
    const expected = job.revision;
    job.noahRegistration.state = state; job.noahRegistration.lastCheckedAt = now();
    job.status = state === 'running' || state === 'needs_user' ? 'active' : 'review';
    await update(owner, job, expected);
  }
  return async (request: Request) => {
    try {
      const url = new URL(request.url);
      if (!['GET','POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      const id = url.searchParams.get('job');
      if (request.method === 'GET' && !id) {
        const agent = url.searchParams.get('agent');
        return json({ providers: enabled ? deps.providers.filter(p => !agent || p.agentIds.includes(agent)).map(({ executorUrl: _internal, ...publicProvider }) => publicProvider) : [] });
      }
      if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return json({ error: 'Noahの画面から送信してください。' }, 403);
      const key = request.headers.get('X-Noah-Registration-Key');
      if (!key || !/^[a-f0-9]{64}$/.test(key)) return json({ error: 'このブラウザの登録情報を確認できません。画面を開き直してください。' }, 401);
      const owner = `noah-registration:${await sha256Hex(key)}`;
      if (request.method === 'GET') {
        if (!uuid(id)) fail('仕事を選び直してください。');
        let job = await read(owner, id);
        const r = job.noahRegistration;
        const provider = deps.providers.find(p => p.id === r.providerId);
        if (enabled && provider && !['completed','failed'].includes(r.state) && now() - r.startedAt >= 20000 && now() - r.lastCheckedAt >= 5000 && await sha256Hex(canonicalJson(provider)) === r.providerDigest) {
          const expected = job.revision; r.lastCheckedAt = now();
          const result = await deps.db.prepare('UPDATE work_jobs SET payload=?,revision=revision+1 WHERE user_id=? AND id=? AND revision=?').bind(JSON.stringify({ ...job, revision: expected + 1 }), owner, id, expected).run();
          if (result.meta.changes === 1) { job.revision++; await settle(owner, job, await callAgent(provider, id)); }
          job = await read(owner, id);
        }
        return json({ job: await present(job) });
      }
      if (!enabled) fail('登録Agentがまだ接続されていません。入力せずに時間をおいてご確認ください。', 503);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: '入力の形式を確認してください。' }, 415);
      const input = await readBounded(request.body);
      if (!object(input) || ![9,10].includes(Object.keys(input).length) || !Object.keys(input).every(k => ['action','id','providerId','agentId','revision','termsVersion','values','consent','termsAccepted','profile'].includes(k)) || input.action !== 'start' || !uuid(input.id) || input.consent !== true || input.termsAccepted !== true || !object(input.values)) fail('送信する内容と同意を確認してください。');
      const provider = deps.providers.find(p => p.id === input.providerId);
      if (!provider || !provider.agentIds.includes(String(input.agentId))) fail('登録先が見つかりません。Agentを選び直してください。', 404);
      if (input.revision !== provider.revision || input.termsVersion !== provider.termsVersion) fail('登録条件が更新されました。画面を開き直して確認してください。', 409);
      if (input.profile !== undefined && !deps.resolveProfile) fail('保存情報はまだ使えません。',503);
      const resolved=await deps.resolveProfile?.(request,provider,input.profile);
      if(resolved && Object.keys(resolved.values).some(k=>Object.hasOwn(input.values as object,k))) fail('同じ項目を二重に指定できません。');
      const supplied={...input.values,...resolved?.values};
      const values: Record<string, string> = {};
      if (Object.keys(input.values).some(k => !provider.fields.some(f => f.key === k))) fail('登録に使えない項目が含まれています。画面を開き直してください。');
      for (const field of provider.fields) {
        const value = supplied[field.key] ?? '';
        if(field.type==='file' && value && !resolved?.documents[field.key])fail('保存した書類を選んでください。');
        if (typeof value !== 'string' || value.length > field.maxLength || hasControl(value) || (field.required && !value.trim()) || (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) fail('必要項目の形式と長さを確認してください。');
        values[field.key] = value;
      }
      const providerDigest = await sha256Hex(canonicalJson(provider));
      const requestDigest = await registrationFingerprint(key, { providerDigest, agentId: input.agentId, termsVersion: provider.termsVersion, values, ...(resolved && Object.keys(resolved.documents).length ? {documents:resolved.documents}: {}) });
      const existing = await deps.db.prepare('SELECT payload FROM work_jobs WHERE user_id=? AND id=?').bind(owner, input.id).first<{ payload: string }>();
      if (existing) {
        const previous = await read(owner, input.id);
        if (previous.noahRegistration.requestDigest !== requestDigest) fail('同じ仕事の内容は変更できません。現在の状況を確認してください。', 409);
        return json({ job: await present(previous) });
      }
      const at = now(), iso = new Date(at).toISOString();
      const job: RegistrationWork = { id: input.id, title: `${provider.name}の登録`, templateId: 'noah-registration', revision: 0, status: 'active', steps: [], events: [], createdAt: iso, updatedAt: iso,
        plan: { schemaVersion: 1, objective: `${provider.name}の登録Agentへ依頼し、結果を本人が確認する`, approvalGates: [] },
        noahRegistration: { schema: 'noah-registration/1', providerId: provider.id, providerName: provider.name, providerRevision: provider.revision, providerDigest, providerOrigin: provider.providerOrigin, agentId: String(input.agentId), requestDigest, termsVersion: provider.termsVersion, state: 'running', startedAt: at, lastCheckedAt: at, expiresAt: at + DAY, verification: 'registration_agent_reported' } };
      const created = await deps.db.prepare(`INSERT OR IGNORE INTO work_jobs(id,user_id,payload,revision,updated_at) SELECT ?,?,?,0,?
        WHERE (SELECT COUNT(*) FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.createdAt')>=?)<10
        AND (SELECT COUNT(*) FROM work_jobs WHERE json_extract(payload,'$.templateId')='noah-registration' AND json_extract(payload,'$.createdAt')>=?)<200`)
        .bind(job.id, owner, JSON.stringify(job), iso, owner, new Date(at - DAY).toISOString(), new Date(at - DAY).toISOString()).run();
      if (created.meta.changes !== 1) {
        const replay = await deps.db.prepare('SELECT payload FROM work_jobs WHERE user_id=? AND id=?').bind(owner, job.id).first<{ payload: string }>();
        if (replay) { const saved = await read(owner, job.id); if (saved.noahRegistration.requestDigest === requestDigest) return json({ job: await present(saved) }); }
        fail('登録の受付上限または同じ仕事の内容を確認してください。時間をおいてお試しください。', 429);
      }
      const run = (async()=>{
        try { await resolved?.beforeSend(); } catch { await settle(owner,job,'failed'); return; }
        await settle(owner,job,await callAgent(provider,job.id,values,resolved?.documents));
      })().catch(() => {});
      if (deps.waitUntil) deps.waitUntil(run); else await run;
      return json({ job: await present(await read(owner, job.id)) }, 202);
    } catch (e) {
      if (e instanceof NoahAgentError) return json({ error: e.message }, e.status);
      if (e instanceof SyntaxError || e instanceof TypeError) return json({ error: '入力を読み取れません。内容を確認してください。' }, 400);
      return json({ error: '登録の状況を確認できません。同じ仕事の状況を読み直してください。' }, 503);
    }
  };
}
