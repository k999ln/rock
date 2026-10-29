'use client';
import { useRef, useState } from 'react';
import { McpBotRunner } from '@/components/mcp-bot-runner';
import { listMcpConnections, type McpConnection, type McpJobClaim } from '@/lib/mcp-hub';
import { compatibleLocalPackageRuntimes } from '@/lib/sky-package-runtime';
import { reviewSkyAgentRequirements } from '@/lib/sky-agent-requirements';
import { parseSkyToolPackage, type SkyToolPackage } from '@/lib/sky-tool-package';
import { includedRockstarServicePackageKeys } from '@/lib/rockstar-service-package-access';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { SkyLibraryAgent } from '@/lib/sky-agent-library';
import type { WorkJob } from '@/lib/workflow';

type RegistryItem = { packageKey: string; manifestSha256: string; status: string; installable: boolean; manifest: SkyToolPackage };
const sha256 = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

/** Existing MCP runner attached to one saved, owner-authorized work job. */
export default function AgentToolJobRunner({ server, toolName, task, packageKey, manifestSha256, job,
  ownerScope, agentReference, isCurrent, onJob, onRunningChange }: {
  server: McpConnection; toolName: string; task: string; packageKey: string; manifestSha256: string;
  job: WorkJob; ownerScope: string; agentReference: { id: string; revision: number };
  isCurrent: () => boolean; onJob: (job: WorkJob) => void; onRunningChange: (running: boolean) => void;
}) {
  const active = useRef<{ id: string; revision: number; inputSha256: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [result, setResult] = useState('');
  const [localFence, setLocalFence] = useState(false);
  const bound = job.agentBinding?.agentId === agentReference.id && job.agentBinding.agentRevision === agentReference.revision;
  // An observed client response is not proof of external completion. Existing
  // unresolved attempts remain fenced until a future authoritative reconciliation.
  const fenced = Boolean(job.toolAttempts?.length) || localFence;

  async function fresh(revision: number) {
    if (!isCurrent()) throw new Error('本人または仕事が変わりました。');
    const [agentResponse, jobsResponse, registryResponse, entitlementResponse, servers] = await Promise.all([
      fetch(`/api/sky/agents?id=${encodeURIComponent(agentReference.id)}`, { cache: 'no-store' }),
      fetch('/api/work-jobs', { cache: 'no-store' }),
      fetch('/api/sky/tool-registry', { cache: 'no-store' }),
      fetch('/api/rockstar/entitlements', { cache: 'no-store' }),
      listMcpConnections(),
    ]);
    if (!agentResponse.ok || !jobsResponse.ok || !registryResponse.ok || !entitlementResponse.ok || !isCurrent())
      throw new Error('本人、仕事、Toolまたは利用権を確認できません。');
    const agent = await agentResponse.json() as { ownerScope?: string; agent?: SkyLibraryAgent };
    const jobs = await jobsResponse.json() as { ownerScope?: string; jobs?: WorkJob[] };
    const registry = await registryResponse.json() as { packages?: RegistryItem[] };
    const entitlement = await entitlementResponse.json() as { ownerScope?: unknown };
    if (!isCurrent() || agent.ownerScope !== ownerScope || jobs.ownerScope !== ownerScope || entitlement.ownerScope !== ownerScope ||
        agent.agent?.id !== agentReference.id || agent.agent.revision !== agentReference.revision || !agent.agent.enabled ||
        agent.agent.requirements?.packageKey !== packageKey || agent.agent.requirements.executionTarget !== 'pc' ||
        !includedRockstarServicePackageKeys(entitlement).has(packageKey) || !Array.isArray(jobs.jobs) || !Array.isArray(registry.packages))
      throw new Error('本人・担当・利用権が変わりました。');
    const sameJob = jobs.jobs.find(item => item.id === job.id);
    if (!sameJob || sameJob.revision !== revision || sameJob.status !== 'active' ||
        sameJob.agentBinding?.agentId !== agentReference.id || sameJob.agentBinding.agentRevision !== agentReference.revision)
      throw new Error('同じ仕事と担当の版を読み直してください。');
    const pkg = registry.packages.find(item => item.packageKey === packageKey && item.manifestSha256 === manifestSha256 &&
      item.status === 'verified' && item.installable === true);
    if (!pkg) throw new Error('Toolの版または審査状態を確認できません。');
    const manifest = parseSkyToolPackage(pkg.manifest);
    if (reviewSkyAgentRequirements(agent.agent.requirements, [{ ...pkg, manifest }], servers).state !== 'candidate' ||
        !compatibleLocalPackageRuntimes(manifest, servers).some(candidate => candidate.server.id === server.id && candidate.tool.name === toolName))
      throw new Error('実行先とToolの入出力を再確認してください。');
  }

  async function begin(input: { serverId: string; toolName: string; args: Record<string, unknown> }) {
    if (!bound || fenced || busy || !isCurrent() || input.serverId !== server.id || input.toolName !== toolName)
      throw new Error('同じ仕事と実行先を確認してください。');
    setBusy(true); setMessage(''); setResult('');
    const id = crypto.randomUUID();
    try {
      await fresh(job.revision);
      const digest = await sha256(JSON.stringify(input.args));
      if (!isCurrent()) throw new Error('入力の観測または本人・仕事が変わりました。');
      setLocalFence(true);
      const response = await fetch('/api/work-jobs/tool-observations', { method: 'POST', headers: {
        'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope,
      }, body: JSON.stringify({ action: 'begin', jobId: job.id, revision: job.revision, attempt: {
        id, packageKey, manifestSha256, connectorId: server.id, toolName, inputSha256: digest,
      } }) });
      const body = await response.json() as { job?: WorkJob; saved?: boolean; error?: string; operationCapability?: { token?: unknown; expiresAt?: unknown } };
      const attempt = body.job?.toolAttempts?.find(item => item.id === id);
      if (!response.ok || body.saved !== true || body.job?.id !== job.id || body.job.revision !== job.revision + 1 ||
          body.job.agentBinding?.agentId !== agentReference.id || body.job.agentBinding.agentRevision !== agentReference.revision ||
          !attempt || attempt.state !== 'pending' || attempt.packageKey !== packageKey || attempt.manifestSha256 !== manifestSha256 ||
          attempt.connectorId !== server.id || attempt.toolName !== toolName || attempt.inputSha256 !== digest ||
          typeof body.operationCapability?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.operationCapability.token) ||
          !Number.isSafeInteger(body.operationCapability.expiresAt) || Number(body.operationCapability.expiresAt) <= Date.now())
        throw new Error(body.error || '実行前の保存を確認できません。同じ仕事を読み直してください。');
      active.current = { id, revision: body.job.revision, inputSha256: digest };
      if (isCurrent()) onJob(body.job);
      // Revocation may happen while the start record is being committed.
      // Failure here leaves the record fenced and dispatches no Tool.
      await fresh(body.job.revision);
      if (!isCurrent()) throw new Error('本人または仕事が変わりました。');
      return { jobId: job.id, attemptId: id, agentId: agentReference.id, agentRevision: agentReference.revision,
        ownerScope, token: body.operationCapability.token };
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '実行前の状態を確認できません。');
      throw reason;
    } finally { setBusy(false); }
  }
  function claimed(claim: McpJobClaim) {
    const attempt = active.current;
    if (!attempt || claim.jobId !== job.id || claim.attemptId !== attempt.id || claim.inputSha256 !== attempt.inputSha256 ||
        claim.jobRevision !== attempt.revision + 1) throw new Error('仕事の実行状態を確認できません。');
    active.current = { ...attempt, revision: claim.jobRevision };
  }
  async function observed(outcome: { ok: boolean; text: string }) {
    const attempt = active.current;
    if (!attempt) return; // Admission failed; no Tool invocation is represented as success.
    if (!outcome.ok || !outcome.text || new TextEncoder().encode(outcome.text).length > 8192) {
      setMessage('Toolの結果を確認できません。新しい実行は保留し、同じ仕事を照合してください。'); return;
    }
    setBusy(true); if (isCurrent()) setResult(outcome.text);
    try {
      const id = crypto.randomUUID();
      const response = await fetch('/api/work-jobs/tool-observations', { method: 'POST', headers: {
        'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope,
      }, body: JSON.stringify({ action: 'observe', jobId: job.id, revision: attempt.revision,
        attemptId: attempt.id, observation: { id, text: outcome.text } }) });
      const body = await response.json() as { job?: WorkJob; error?: string };
      const saved = body.job?.toolObservations?.find(item => item.id === id);
      const savedAttempt = body.job?.toolAttempts?.find(item => item.id === attempt.id);
      const stoppedAfterClaim = body.job?.revision === attempt.revision + 2 && body.job.status === 'cancelled' &&
        body.job.events.at(-1)?.command.action === 'cancel' && savedAttempt?.claimedRevision === attempt.revision &&
        typeof savedAttempt.stopRequestedAt === 'string';
      if (!response.ok || body.job?.id !== job.id || (body.job.revision !== attempt.revision + 1 && !stoppedAfterClaim) || !saved || saved.text !== outcome.text ||
          saved.packageKey !== packageKey || saved.manifestSha256 !== manifestSha256 || saved.connectorId !== server.id ||
          saved.toolName !== toolName || saved.verification !== 'client_observed_unverified') throw new Error(body.error || '成果の保存を確認できません。');
      const read = await fetch('/api/work-jobs', { cache: 'no-store' });
      const readback = await read.json() as { ownerScope?: string; jobs?: WorkJob[] };
      const actual = readback.jobs?.find(item => item.id === job.id);
      if (!read.ok || readback.ownerScope !== ownerScope || !actual || actual.revision !== body.job.revision ||
          !actual.toolObservations?.some(item => item.id === id && item.text === outcome.text && item.verification === 'client_observed_unverified'))
        throw new Error('保存結果を読み直せません。');
      if (isCurrent()) onJob(actual);
      setMessage('Tool画面で受け取った内容を同じ仕事に保存しました。外部処理の成功や費用は独立確認されていません。');
    } catch {
      setMessage('成果の保存結果は未確認です。同じ仕事を読み直してください。新しいTool実行は行いません。');
    } finally { setBusy(false); }
  }
  return <section aria-label="同じ仕事でToolを使う">
    <p>本人の担当と同じ仕事へ結び、実行前に記録します。Toolの結果は本人が確認するまで未検証です。</p>
    <McpBotRunner server={server} request={task} fixedToolName={toolName} executionDisabled={!bound || fenced || busy}
      beforeExecute={begin} onJobClaim={claimed} onOutcome={outcome => { void observed(outcome); }} onRunningChange={onRunningChange} />
    {fenced && !message && <p>この仕事には未照合の実行があります。自動で再実行しません。</p>}
    {message && <p role="alert">{message}</p>}
    {result && <p>保存状況が不明な場合も、元の結果は上の画面で確認してください。</p>}
  </section>;
}
