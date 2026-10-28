'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listMcpConnections, type McpConnection } from '@/lib/mcp-hub';
import { readOwnerScope, OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { includedRockstarServicePackageKeys } from '@/lib/rockstar-service-package-access';
import { parseSkyToolPackage } from '@/lib/sky-tool-package';
import { reviewSkyAgentRequirements, type RequirementsPackage, type SkyAgentRequirements } from '@/lib/sky-agent-requirements';
import type { SkyLibraryAgent } from '@/lib/sky-agent-library';

const empty = (): SkyAgentRequirements => ({ inputFields: [], outputFields: [], packageKey: '', executionTarget: '' });
const lines = (text: string) => text.split('\n').map(value => value.trim()).filter(Boolean);

/** A saved intent and capability review. It never creates a job or grants a Tool. */
export default function SkyAgentCapabilityReview({ agent, onSaved }: {
  agent: SkyLibraryAgent; onSaved?: (agent: SkyLibraryAgent) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(agent);
  const [owner, setOwner] = useState('');
  const [requirements, setRequirements] = useState<SkyAgentRequirements>(agent.requirements ?? empty());
  const [inputText, setInputText] = useState((agent.requirements?.inputFields ?? []).join('\n'));
  const [outputText, setOutputText] = useState((agent.requirements?.outputFields ?? []).join('\n'));
  const [packages, setPackages] = useState<RequirementsPackage[]>([]);
  const [servers, setServers] = useState<McpConnection[] | null>(null);
  const [entitlements, setEntitlements] = useState<Set<string> | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [fresh, setFresh] = useState(false);
  const wanted = useMemo(() => ({ ...requirements, inputFields: lines(inputText), outputFields: lines(outputText) }), [requirements, inputText, outputText]);
  const review = useMemo(() => {
    try { return reviewSkyAgentRequirements(wanted, packages, servers); }
    catch { return { state: 'missing' as const, issues: ['必要な入力と成果の項目を確認してください。'], candidates: [] }; }
  }, [wanted, packages, servers]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setFresh(false); setOwner(''); setPackages([]); setServers(null); setEntitlements(null); } });
    void (async () => {
      try {
        const identity = await fetch(`/api/sky/agents?id=${encodeURIComponent(agent.id)}`, { cache: 'no-store', signal: controller.signal });
        const first = await identity.json() as { agent?: SkyLibraryAgent; ownerScope?: unknown; error?: string };
        if (!identity.ok || !readOwnerScope(first.ownerScope) || !first.agent || first.agent.id !== agent.id || first.agent.revision !== agent.revision)
          throw new Error(first.error || '本人と担当の最新版を確認してください。');
        const packageResponse = await fetch('/api/sky/tool-registry', { cache: 'no-store', signal: controller.signal });
        const data = await packageResponse.json() as { packages?: RequirementsPackage[]; error?: string };
        if (!packageResponse.ok || !Array.isArray(data.packages)) throw new Error(data.error || 'Tool一覧を確認できません。');
        const parsed = data.packages.map(item => ({ ...item, manifest: parseSkyToolPackage(item.manifest) }));
        const entitlementResponse = await fetch('/api/rockstar/entitlements', { cache: 'no-store', signal: controller.signal });
        if (!entitlementResponse.ok) throw new Error('利用権を確認できません。');
        const entitlement = await entitlementResponse.json() as { ownerScope?: unknown };
        if (entitlement.ownerScope !== first.ownerScope) throw new Error('利用権の本人が変わりました。');
        const allowed = includedRockstarServicePackageKeys(entitlement);
        const connected = await listMcpConnections().catch(() => null);
        const check = await fetch(`/api/sky/agents?id=${encodeURIComponent(agent.id)}`, { cache: 'no-store', signal: controller.signal });
        const last = await check.json() as { agent?: SkyLibraryAgent; ownerScope?: unknown };
        if (!check.ok || last.ownerScope !== first.ownerScope || last.agent?.id !== agent.id || last.agent.revision !== agent.revision)
          throw new Error('本人または担当が変わりました。画面を読み直してください。');
        if (!controller.signal.aborted) { setOwner(first.ownerScope as string); setPackages(parsed); setServers(connected); setEntitlements(allowed); setFresh(true); }
      } catch (reason) {
        if (!controller.signal.aborted) { setFresh(false); setError(reason instanceof Error ? reason.message : '担当とToolを確認できません。'); }
      }
    })();
    return () => controller.abort();
  }, [agent.id, agent.revision]);
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => setFresh(false), 30_000);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  async function openWork() {
    if (!fresh || !owner || dirty || uncertain || saving || review.state !== 'candidate') return;
    setSaving(true); setError('');
    try {
      // Revalidate the same authenticated owner, Agent revision, reviewed Package,
      // and connected runtime before navigating. No execution or approval occurs here.
      const checkAgent = async () => {
        const response = await fetch(`/api/sky/agents?id=${encodeURIComponent(current.id)}`, { cache: 'no-store' });
        const body = await response.json() as { agent?: SkyLibraryAgent; ownerScope?: unknown };
        if (!response.ok || body.ownerScope !== owner || body.agent?.id !== current.id || body.agent.revision !== current.revision ||
            JSON.stringify(body.agent.requirements) !== JSON.stringify(wanted)) throw new Error('本人または担当が変わりました。読み直してください。');
      };
      await checkAgent();
      const response = await fetch('/api/sky/tool-registry', { cache: 'no-store' });
      const body = await response.json() as { packages?: RequirementsPackage[] };
      if (!response.ok || !Array.isArray(body.packages)) throw new Error('Tool一覧を確認できません。');
      const actual = body.packages.map(item => ({ ...item, manifest: parseSkyToolPackage(item.manifest) }));
      const oldPackage = packages.find(item => item.packageKey === wanted.packageKey);
      const newPackage = actual.find(item => item.packageKey === wanted.packageKey);
      if (!oldPackage || !newPackage || JSON.stringify(oldPackage) !== JSON.stringify(newPackage)) throw new Error('Toolの版または審査状態が変わりました。読み直してください。');
      const entitlementResponse = await fetch('/api/rockstar/entitlements', { cache: 'no-store' });
      const entitlement = await entitlementResponse.json() as { ownerScope?: unknown };
      if (!entitlementResponse.ok || entitlement.ownerScope !== owner || !includedRockstarServicePackageKeys(entitlement).has(wanted.packageKey))
        throw new Error('このToolの利用権を確認できません。');
      const connected = await listMcpConnections();
      if (reviewSkyAgentRequirements(wanted, actual, connected).state !== 'candidate') throw new Error('実行先の接続または能力が変わりました。読み直してください。');
      await checkAgent();
      router.push(`/chat?${new URLSearchParams({ agent: current.id, agentRevision: String(current.revision), package: wanted.packageKey, view: 'work' })}`);
    } catch (reason) {
      setFresh(false); setError(reason instanceof Error ? reason.message : '接続を確認できません。読み直してください。');
    } finally { setSaving(false); }
  }

  async function save() {
    if (!owner || saving || uncertain) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/sky/agents', { method: 'PUT', headers: {
        'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: owner,
      }, body: JSON.stringify({ id: current.id, revision: current.revision, settings: {
        name: current.name, instructions: current.instructions, provider: current.provider, model: current.model,
        enabled: current.enabled, requirements: wanted,
      } }) });
      if (response.status >= 500) { setUncertain(true); throw new Error('保存できたか確認できません。担当を読み直してから確認してください。'); }
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || '担当の設定を保存できません。');
      }
      // Even an HTTP 200 can have a lost or mismatched body. Read back the
      // exact same owner, Agent ID, revision and submitted fields before use.
      const body = await response.json() as { agent?: SkyLibraryAgent };
      const saved = body.agent;
      if (!saved || saved.id !== current.id || saved.revision !== current.revision + 1 ||
          saved.name !== current.name || saved.instructions !== current.instructions || saved.provider !== current.provider ||
          saved.model !== current.model || saved.enabled !== current.enabled || JSON.stringify(saved.requirements) !== JSON.stringify(wanted)) {
        setUncertain(true); throw new Error('保存結果が一致しません。同じ担当を読み直してください。');
      }
      const read = await fetch(`/api/sky/agents?id=${encodeURIComponent(current.id)}`, { cache: 'no-store' });
      const readback = await read.json() as { agent?: SkyLibraryAgent; ownerScope?: unknown };
      if (!read.ok || readback.ownerScope !== owner || JSON.stringify(readback.agent) !== JSON.stringify(saved)) {
        setUncertain(true); throw new Error('保存先または内容を確認できません。同じ担当を読み直してください。');
      }
      setCurrent(saved); setRequirements(saved.requirements ?? empty()); setDirty(false);
      setFresh(false); setNotice('必要な能力を保存しました。Toolの使用許可は別に確認します。'); onSaved?.(saved);
    } catch (reason) {
      if (!(reason instanceof Error)) setUncertain(true);
      setError(reason instanceof Error ? reason.message : '保存状態を確認できません。担当を読み直してください。');
      // A network failure may have committed; never automatically resend.
      if (reason instanceof TypeError || reason instanceof SyntaxError) setUncertain(true);
    } finally { setSaving(false); }
  }

  return <section aria-label="担当の必要な能力">
    <h3>この担当に必要な入力・成果・Tool</h3>
    <p>希望を設定し、宣言と接続を照合します。項目名の一致は値の妥当性や成果の保証ではありません。保存は実行や権限の承認ではありません。</p>
    <label>必要な入力項目（1行に1項目）<textarea value={inputText} onChange={event => { setInputText(event.target.value); setDirty(true); }} maxLength={1295} /></label>
    <label>必要な成果項目（1行に1項目）<textarea value={outputText} onChange={event => { setOutputText(event.target.value); setDirty(true); }} maxLength={1295} /></label>
    <label>Tool<select value={requirements.packageKey} onChange={event => { setRequirements(value => ({ ...value, packageKey: event.target.value })); setDirty(true); }}>
      <option value="">選択してください</option>{packages.map(item => <option key={item.packageKey} value={item.packageKey}>{item.manifest.name} · {item.manifest.version} ({item.status})</option>)}
    </select></label>
    <label>実行先<select value={requirements.executionTarget} onChange={event => { setRequirements(value => ({ ...value, executionTarget: event.target.value as SkyAgentRequirements['executionTarget'] })); setDirty(true); }}>
      <option value="">選択してください</option><option value="device_local">端末内</option><option value="pc">PC</option><option value="cloud">Cloud</option>
    </select></label>
    <output>{!fresh ? '接続情報は未確認または期限切れです。画面を読み直してください。' : wanted.packageKey && entitlements && !entitlements.has(wanted.packageKey) ? 'このToolの利用権を確認できません。' : review.issues.join(' ')}</output>
    {review.candidates.map(candidate => <p key={`${candidate.serverId}:${candidate.toolName}`}>{candidate.serverName} · {candidate.toolName}</p>)}
    <button type="button" disabled={!owner || saving || !dirty || uncertain} onClick={() => void save()}>{saving ? '保存しています…' : '必要な能力を保存'}</button>
    {notice && <output>{notice}</output>}{error && <p role="alert">{error}</p>}
    {!dirty && !uncertain && fresh && entitlements?.has(wanted.packageKey) && review.state === 'candidate' && <button type="button" disabled={saving} onClick={() => void openWork()}>同じ担当で仕事の確認へ進む</button>}
  </section>;
}
