'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listMcpConnections, refreshMcpObservation, type McpConnection } from '@/lib/mcp-hub';
import { isFreshMcpObservation } from '@/lib/sky-package-runtime';
import { readOwnerScope, OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { includedRockstarServicePackageKeys } from '@/lib/rockstar-service-package-access';
import { parseSkyToolPackage } from '@/lib/sky-tool-package';
import { parseSkyAgentRequirements, reviewSkyAgentRequirements, type RequirementsPackage, type SkyAgentRequirements } from '@/lib/sky-agent-requirements';
import type { SkyLibraryAgent } from '@/lib/sky-agent-library';

const empty = (): SkyAgentRequirements => ({ inputFields: [], outputFields: [], packageKey: '', executionTarget: '' });
const lines = (text: string) => text.split('\n').map(value => value.trim()).filter(Boolean);
const observationTime = (value: unknown) => typeof value === 'number' && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toISOString() : '未確認';

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
  const initialContract = agent.requirements?.contract;
  const [inputTypesText,setInputTypesText] = useState(initialContract?.inputTypes === undefined ? '' : JSON.stringify(initialContract.inputTypes));
  const [outputTypesText,setOutputTypesText] = useState(initialContract?.outputTypes === undefined ? '' : JSON.stringify(initialContract.outputTypes));
  const [capabilitiesText,setCapabilitiesText] = useState(initialContract?.capabilityIds === undefined ? '' : JSON.stringify(initialContract.capabilityIds));
  const [permissionsText,setPermissionsText] = useState(initialContract?.allowedPermissions === undefined ? '' : JSON.stringify(initialContract.allowedPermissions));
  const [runtimeText,setRuntimeText] = useState(initialContract?.runtime ? JSON.stringify([initialContract.runtime.serverId,initialContract.runtime.toolName]) : '');
  const [packages, setPackages] = useState<RequirementsPackage[]>([]);
  const [servers, setServers] = useState<McpConnection[] | null>(null);
  const [entitlements, setEntitlements] = useState<Set<string> | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [reviewedSchema, setReviewedSchema] = useState('');
  const reviewRef = useRef({ key: '', confirmed: false, deadline: 0, generation: 0 });
  const refreshRef = useRef({ generation: 0, owner: '', runtime: '', agentId: '', revision: 0 });
  useEffect(() => { Object.assign(refreshRef.current, { owner, runtime: runtimeText, agentId: current.id, revision: current.revision }); },
    [owner, runtimeText, current.id, current.revision]);
  const desired = useMemo(() => {
    try {
      const contract:Record<string,unknown> = {schema:'rockstaros.agent-tool-expectation/1'};
      for(const [key,text] of [['inputTypes',inputTypesText],['outputTypes',outputTypesText],['capabilityIds',capabilitiesText],['allowedPermissions',permissionsText]])
        if(text.trim())contract[key]=JSON.parse(text);
      if(runtimeText){const [serverId,toolName]=JSON.parse(runtimeText);contract.runtime={serverId,toolName};}
      const hasContract=Boolean(requirements.contract)||Object.keys(contract).length>1;
      return { wanted:parseSkyAgentRequirements({...requirements,inputFields:lines(inputText),outputFields:lines(outputText),...(hasContract?{contract}:{})}),error:'' };
    } catch(reason) { return {wanted:null,error:reason instanceof Error?reason.message:'条件の形式を確認してください。'}; }
  },[requirements,inputText,outputText,inputTypesText,outputTypesText,capabilitiesText,permissionsText,runtimeText]);
  const wanted = desired.wanted ?? requirements;
  const runtimeStamp = (connections:readonly McpConnection[]|null) => JSON.stringify(connections?.filter(s=>s.id===wanted.contract?.runtime?.serverId).map(s=>({id:s.id,transport:s.transport,digest:s.passport?.toolDigest,state:s.state})));

  const selectedServer = servers?.find(server => server.id === wanted.contract?.runtime?.serverId);
  const observationFresh = isFreshMcpObservation(selectedServer?.passport ?? null);
  const reviewedRuntimeStamp=runtimeStamp(servers);
  const selectedPackage = packages.find(item => item.packageKey === wanted.packageKey);
  // This is a local acknowledgement of displayed declarations, not authority.
  // Bind it to the Agent, exact requirements and full Package; any change clears it.
  const schemaReviewKey = selectedPackage && fresh && owner && observationFresh && !desired.error ? JSON.stringify({ owner, id: current.id, revision: current.revision,
    wanted, package: selectedPackage, runtime:reviewedRuntimeStamp }) : '';
  const review = useMemo(() => {
    try { return desired.error ? {state:'missing' as const,issues:[desired.error],candidates:[]} : reviewSkyAgentRequirements(wanted, packages, servers); }
    catch { return { state: 'missing' as const, issues: ['必要な入力と成果の項目を確認してください。'], candidates: [] }; }
  }, [wanted, packages, servers, desired.error]);

  useEffect(() => {
    const deadline = selectedServer?.passport?.observationExpiresAt;
    if (!Number.isSafeInteger(deadline) || deadline! <= Date.now()) return;
    const timer = window.setTimeout(() => {
      reviewRef.current.generation++; reviewRef.current.confirmed = false; setReviewedSchema('');
      setServers(current => current ? [...current] : null);
    }, deadline! - Date.now());
    return () => window.clearTimeout(timer);
  }, [selectedServer]);

  useEffect(() => {
    const controller = new AbortController();
    const activeReview = reviewRef.current, activeRefresh = refreshRef.current;
    queueMicrotask(() => { if (!controller.signal.aborted) { reviewRef.current.generation++; reviewRef.current.confirmed = false; reviewRef.current.deadline = 0; setFresh(false); setReviewedSchema(''); setOwner(''); setPackages([]); setServers(null); setEntitlements(null); } });
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
        if (!controller.signal.aborted) { reviewRef.current.deadline = Date.now() + 30_000; setOwner(first.ownerScope as string); setPackages(parsed); setServers(connected); setEntitlements(allowed); setFresh(true); }
      } catch (reason) {
        if (!controller.signal.aborted) { setFresh(false); setError(reason instanceof Error ? reason.message : '担当とToolを確認できません。'); }
      }
    })();
    return () => { activeRefresh.generation++; activeReview.generation++; activeReview.confirmed = false; activeReview.deadline = 0; controller.abort(); };
  }, [agent.id, agent.revision]);
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => { reviewRef.current.generation++; reviewRef.current.confirmed = false; reviewRef.current.deadline = 0; setFresh(false); setReviewedSchema(''); }, 30_000);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  async function openWork() {
    if (!fresh || !owner || dirty || uncertain || saving || review.state !== 'candidate' || !schemaReviewKey || reviewedSchema !== schemaReviewKey) return;
    const generation = reviewRef.current.generation;
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
      if (!isFreshMcpObservation(connected.find(server => server.id === wanted.contract?.runtime?.serverId)?.passport ?? null)) throw new Error('選択した実Toolの観測が期限切れです。再確認してください。');
      if(runtimeStamp(connected)!==reviewedRuntimeStamp)throw new Error('選択した実Toolの版・接続が変わりました。');
      if (reviewSkyAgentRequirements(wanted, actual, connected).state !== 'candidate') throw new Error('実行先の接続または能力が変わりました。読み直してください。');
      await checkAgent();
      if (!isFreshMcpObservation(connected.find(server => server.id === wanted.contract?.runtime?.serverId)?.passport ?? null) ||
          !isFreshMcpObservation(selectedServer?.passport ?? null) ||
          reviewRef.current.generation !== generation || !reviewRef.current.confirmed || reviewRef.current.key !== schemaReviewKey || Date.now() >= reviewRef.current.deadline)
        throw new Error('確認が変更または期限切れになりました。内容を読み直してください。');
      router.push(`/chat?${new URLSearchParams({ agent: current.id, agentRevision: String(current.revision), package: wanted.packageKey, view: 'work' })}`);
    } catch (reason) {
      setFresh(false); setError(reason instanceof Error ? reason.message : '接続を確認できません。読み直してください。');
    } finally { setSaving(false); }
  }

  async function save() {
    if (!owner || saving || uncertain) return;
    if (desired.error || !desired.wanted) { setError(desired.error); return; }
    reviewRef.current.generation++; reviewRef.current.confirmed = false;
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
    <label>必要な入力項目（1行に1項目）<textarea disabled={saving||uncertain} value={inputText} onChange={event => { reviewRef.current.generation++; reviewRef.current.confirmed = false; setInputText(event.target.value); setDirty(true); }} maxLength={1295} /></label>
    <label>必要な成果項目（1行に1項目）<textarea disabled={saving||uncertain} value={outputText} onChange={event => { reviewRef.current.generation++; reviewRef.current.confirmed = false; setOutputText(event.target.value); setDirty(true); }} maxLength={1295} /></label>
    <p>型・処理能力ID・許容permissionとscopeを明示します。空欄は未指定、空の配列やobjectは明示した空条件です。scopeは完全一致で照合し、自由文から推測しません。</p>
    {([
      ['期待する入力型（JSON）',inputTypesText,setInputTypesText],
      ['期待する成果型（JSON）',outputTypesText,setOutputTypesText],
      ['必要な処理能力ID（JSON）',capabilitiesText,setCapabilitiesText],
      ['許容permissionとscope（JSON）',permissionsText,setPermissionsText],
    ] as const).map(([label,value,setValue])=><label key={label}>{label}<textarea value={value} maxLength={6000} disabled={saving||uncertain}
      onChange={event=>{reviewRef.current.generation++;reviewRef.current.confirmed=false;setValue(event.target.value);setDirty(true);}} /></label>)}
    <label>使用する接続と操作<select value={runtimeText} disabled={saving||uncertain} onChange={event=>{refreshRef.current.generation++;reviewRef.current.generation++;reviewRef.current.confirmed=false;setRuntimeText(event.target.value);setDirty(true);}}>
      <option value="">未指定</option>{servers?.flatMap(server=>server.passport?.tools.map(tool=><option key={server.id+':'+tool.name} value={JSON.stringify([server.id,tool.name])}>{server.name} · {tool.name}</option>)??[])}
    </select></label>
    {wanted.contract?.runtime && <div aria-label="選択した実Toolの観測">
      <p>接続先: {selectedServer?.name ?? '未確認'} ({wanted.contract.runtime.serverId}) · 選択Tool: {wanted.contract.runtime.toolName}</p>
      <p>接続先の申告版: {selectedServer?.passport?.server?.version ?? '未確認'} · Package版: {selectedPackage?.manifest.version ?? '未確認'}</p>
      <p>観測日時: {observationTime(selectedServer?.passport?.observedAt)} · 有効期限: {observationTime(selectedServer?.passport?.observationExpiresAt)} (UTC)</p>
      <p>接続先が申告した宣言の観測です。安全性・権限・処理成功の保証ではありません。</p>
    </div>}
    {wanted.contract?.runtime?.serverId && !observationFresh && <output>実Toolの観測が未確認または期限切れです。接続済みのToolを再確認してください。</output>}
    {wanted.contract?.runtime?.serverId && <button type="button" disabled={saving || uncertain} onClick={() => {
      const id = wanted.contract!.runtime!.serverId, selectedOwner = owner, selectedRuntime = runtimeText;
      const selectedAgent = current.id, selectedRevision = current.revision;
      const generation = ++refreshRef.current.generation;
      reviewRef.current.generation++; reviewRef.current.confirmed = false; setReviewedSchema('');
      // Retain declarations for display, but immediately invalidate the old observation.
      setServers(current => current?.map(server => server.id === id && server.passport
        ? { ...server, passport: { ...server.passport, observedAt: undefined, observationExpiresAt: undefined } } : server) ?? null);
      const stillCurrent = () => refreshRef.current.generation === generation && refreshRef.current.owner === selectedOwner &&
        refreshRef.current.runtime === selectedRuntime && refreshRef.current.agentId === selectedAgent && refreshRef.current.revision === selectedRevision;
      void (async () => {
        const passport = await refreshMcpObservation(id);
        const identity = await fetch(`/api/sky/agents?id=${encodeURIComponent(selectedAgent)}`, { cache: 'no-store' });
        const body = await identity.json() as { ownerScope?: unknown; agent?: SkyLibraryAgent };
        if (!stillCurrent()) return;
        if (!identity.ok || body.ownerScope !== selectedOwner || body.agent?.id !== selectedAgent || body.agent.revision !== selectedRevision ||
            !isFreshMcpObservation(passport)) throw new Error('本人・担当または実Toolの観測を確認できません。');
        setServers(current => current?.map(server => server.id === id ? { ...server, passport } : server) ?? null);
      })().catch(reason => { if (stillCurrent()) setError(reason instanceof Error ? reason.message : '実Toolを再確認できません。'); });
    }}>選択した実Toolを再確認</button>}
    <label>Tool<select disabled={saving||uncertain} value={requirements.packageKey} onChange={event => { reviewRef.current.generation++; reviewRef.current.confirmed = false; setRequirements(value => ({ ...value, packageKey: event.target.value })); setDirty(true); }}>
      <option value="">選択してください</option>{packages.map(item => <option key={item.packageKey} value={item.packageKey}>{item.manifest.name} · {item.manifest.version} ({item.status})</option>)}
    </select></label>
    <label>実行先<select disabled={saving||uncertain} value={requirements.executionTarget} onChange={event => { reviewRef.current.generation++; reviewRef.current.confirmed = false; setRequirements(value => ({ ...value, executionTarget: event.target.value as SkyAgentRequirements['executionTarget'] })); setDirty(true); }}>
      <option value="">選択してください</option><option value="device_local">端末内</option><option value="pc">PC</option><option value="cloud">Cloud</option>
    </select></label>
    {selectedPackage && <div>
      <p>Toolの宣言です。目的文から必要な項目や型を自動で読み取っていません。空欄も含め、担当の希望と照らしてください。</p>
      <p>入力の型・必須項目</p><pre>{JSON.stringify(selectedPackage.manifest.io.inputSchema, null, 2)}</pre>
      <p>成果の型・項目</p><pre>{JSON.stringify(selectedPackage.manifest.io.outputSchema, null, 2)}</pre>
      <label><input type="checkbox" disabled={!schemaReviewKey || dirty || uncertain || saving} checked={Boolean(schemaReviewKey) && reviewedSchema === schemaReviewKey}
        onChange={event => { reviewRef.current.generation++; reviewRef.current.key = schemaReviewKey; reviewRef.current.confirmed = event.target.checked && Boolean(schemaReviewKey) && !dirty && !uncertain; setReviewedSchema(event.target.checked ? schemaReviewKey : ''); }} />
        入力と成果の宣言を、担当の希望と自分で確認しました</label>
    </div>}
    <output>{desired.error || (!fresh ? '接続情報は未確認または期限切れです。画面を読み直してください。' : wanted.packageKey && entitlements && !entitlements.has(wanted.packageKey) ? 'このToolの利用権を確認できません。' : review.issues.join(' '))}</output>
    {review.candidates.map(candidate => <p key={`${candidate.serverId}:${candidate.toolName}`}>{candidate.serverName} · {candidate.toolName}</p>)}
    <button type="button" disabled={!owner || saving || !dirty || uncertain} onClick={() => void save()}>{saving ? '保存しています…' : '必要な能力を保存'}</button>
    {notice && <output>{notice}</output>}{error && <p role="alert">{error}</p>}
    {!dirty && !uncertain && fresh && entitlements?.has(wanted.packageKey) && review.state === 'candidate' && <button type="button" disabled={saving || !schemaReviewKey || reviewedSchema !== schemaReviewKey} onClick={() => void openWork()}>同じ担当で仕事の確認へ進む</button>}
  </section>;
}
