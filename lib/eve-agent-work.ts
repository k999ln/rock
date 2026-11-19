import {agentUsageStatement} from './sky-agent-usage-statement.ts';
import {collectionConsentMatches, type AgentCollectionConsent} from './sky-agent-collection-consent.ts';
import {SkyPaymentError} from './sky-stripe.ts';
import {sha256Hex} from './rockstar-entitlement-claim.ts';
import { prepareAuthorAllocation } from './sky-author-remuneration.ts';
import { authorAgreementDocuments } from './sky-author-agreement-documents.ts';
import { verifyAuthorUsageAgreement } from './sky-author-usage-agreement.ts';
import { observeAgentUsageProvenance, resolveCapturedAgentUsageSource } from './sky-agent-usage-provenance.ts';
import { buildEveAgentRepairDraft, EVE_AGENT_MAX_REPAIRS, resolveEveAgentResults, sameEveAgentArtifacts } from './eve-agent-repair.ts';
import { parseEveAgentCriteria } from './eve-agent-result-check.ts';
import { decryptA2AArtifact } from './a2a-input-crypto.ts';
import { workStore } from './work-store.ts';
import { a2aDelegationStore, A2A_MAX_DELEGATIONS_PER_PARENT_JOB } from './a2a-delegation-store.ts';
import { buildA2AParentControllerSnapshot } from './a2a-parent-controller.ts';
import { observeStoredAgentUsage } from './sky-usage-observation.ts';
import { eveHistoryStore, eveThreadId, EveHistoryError, type EveHistoryKeys } from './eve-history.ts';
import { createWorkJob, bindEveAgentWork, requestEveAgentStop, probeEveAgentStop, applyWorkCommand, objectInput, workId, WorkError, type WorkJob } from './workflow.ts';

const terminal = new Set(['remote_completed', 'remote_failed', 'remote_rejected', 'expired', 'cancelled_before_dispatch', 'remote_cancelled']);
export function eveAgentWorkStore(db: Pick<D1Database, 'prepare' | 'batch'>, owner: string, keys?: EveHistoryKeys, artifactKey?: string, authorAgreementKeys?: string) {
  const works = workStore(db), agents = a2aDelegationStore(db), history = keys ? eveHistoryStore(db, owner, keys, true) : null;
  async function get(id: unknown, bound = true) {
    const job = await works.get(owner, workId(id));
    if (!job || job.templateId !== 'cloud-agent' || (bound && !job.eveAgent)) throw new WorkError('EveのAgent仕事が見つかりません。', 404);
    return job;
  }
  async function snapshot(job: WorkJob, includeAgreementDocuments = false) {
    const children = await agents.listForParent(owner, job.id);
    const [budget, reservations, details] = await Promise.all([
      agents.getBudget(owner, job.id), agents.listBudgetReservations(owner, job.id),
      Promise.all((await resolveEveAgentResults(db, owner, job, artifactKey)).map(async ({child, inspection, supersededBy}) => {
        const [receipt, artifacts] = await Promise.all([agents.getUsageReceipt(owner, child.id), agents.listArtifacts(owner, child.id)]);
        const source = resolveCapturedAgentUsageSource(job.eveAgent?.usageSources?.find(s => s.provenance.delegationId === child.id),
          await observeAgentUsageProvenance(db, owner, job.id, child.id));
        const captured=job.eveAgent?.usageSources?.find(s=>s.provenance.delegationId===child.id);
        let authorAgreementStatus: 'contract_not_bound' | 'agreement_bound_pending_collection' | 'agreement_unavailable' = 'contract_not_bound';
        if(captured?.authorAgreement) {
          authorAgreementStatus='agreement_unavailable';
          if(source.state==='captured' && source.currentBindingStatus==='active') {
            try { const verified=await verifyAuthorUsageAgreement(captured.authorAgreement.agreement,captured,authorAgreementKeys);
              if(await authorAgreementDocuments(db).valid(verified.agreement,verified.agreementSha256) && verified.agreementSha256===captured.authorAgreement.agreementSha256 && verified.receiptSha256===captured.authorAgreement.receiptSha256) authorAgreementStatus='agreement_bound_pending_collection';
            } catch { /* Retain the original contract reference; current eligibility is unavailable. */ }
          }
        }
        const agreementCandidates=includeAgreementDocuments && captured ? await authorAgreementDocuments(db).list(captured) : [];
        const agreementDocument=includeAgreementDocuments && captured?.authorAgreement ? await authorAgreementDocuments(db).valid(captured.authorAgreement.agreement,captured.authorAgreement.agreementSha256,true) : null;
        return { id: child.id, state: child.state, agentName: child.targetAgentName, agentVersion: child.targetAgentVersion, remoteTaskId: child.remoteTaskId,
          usage: receipt ? observeStoredAgentUsage(receipt) : null,
          artifactCount: artifacts.length, inspection, supersededBy,
          usageProvenance: source.provenance, usageSourceState: source.state, usageBindingStatus: source.currentBindingStatus, authorAgreementStatus, authorAllocation: captured?.authorAllocation ?? null, collectionConsent: captured?.collectionConsent ?? null, agreementDocuments: agreementCandidates.map(d=>({id:d.agreementId,version:d.version,termsText:d.termsText,termsSha256:d.termsSha256,publisherId:d.publisherId,platformId:d.platformId,revoked:d.revokedAt!==null,bound:captured?.authorAgreement?.agreementSha256===d.agreementSha256})), agreementDocument: agreementDocument ? {version:agreementDocument.version,termsText:agreementDocument.termsText,termsSha256:agreementDocument.termsSha256,publisherId:agreementDocument.publisherId,platformId:agreementDocument.platformId,revoked:agreementDocument.revokedAt!==null} : null };
      })),
    ]);
    const controller = buildA2AParentControllerSnapshot({ ownerUserId: owner, parentJobId: job.id, delegations: children, budget, reservations });
    return { job, controller, children: details, stop: {
      requested: job.eveAgent?.stopRequestedAt !== undefined,
      confirmed: job.status === 'cancelled' && children.every(child => terminal.has(child.state)),
      pendingChildren: children.filter(child => !terminal.has(child.state)).length,
    } };
  }
  async function resultExcerpts(job: WorkJob) {
    const lines: string[] = [];
    let remaining = 4000;
    for (const child of (await agents.listForParent(owner, job.id)).slice(0, 8)) {
      if (child.artifactsCaptured !== 1 || !child.remoteTaskId) continue;
      for (const artifact of (await agents.listArtifacts(owner, child.id)).slice(0, 2)) {
        if (artifact.remoteTaskId !== child.remoteTaskId) continue;
        lines.push(`保存成果参照: ${child.id} / ${artifact.id} / SHA256 ${artifact.artifactSha256}`);
        if (!artifactKey) { lines.push('成果本文は復号鍵の復旧後に確認してください。'); continue; }
        try {
          const serialized = await decryptA2AArtifact({ ...artifact, keyVersion: artifact.keyVersion as 'aes-256-gcm-v1' }, artifactKey, owner, child.id, child.remoteTaskId);
          const document = JSON.parse(serialized) as { schemaVersion?: unknown; artifacts?: Array<{ textParts?: unknown }> };
          if (document.schemaVersion !== 1 || !Array.isArray(document.artifacts)) throw new Error('artifact schema');
          const text = document.artifacts.slice(0, 16).flatMap(item => Array.isArray(item.textParts) ? item.textParts.filter((part): part is string => typeof part === 'string') : []).join('\n');
          const excerpt = text.slice(0, Math.min(1600, remaining)); remaining -= excerpt.length;
          lines.push(`Agentからの保存成果（未検収・抜粋）:\n${excerpt || '表示できるテキストはありません。'}`);
          if (text.length > excerpt.length) lines.push('全文は仕事の保存成果から確認してください。');
        } catch { lines.push('成果本文を取得できません。保存成果を上書きせず、鍵と内容を確認してください。'); }
      }
    }
    return lines.join('\n');
  }
  async function publish(job: WorkJob) {
    const result = await snapshot(job);
    let historySaved = true;
    try {
      if (!history) throw new WorkError('会話の暗号化保管へ接続できません。', 503);
      const current = await history.get(job.eveAgent!.threadId);
      const stateName = { not_started: 'Agent未選択・依頼は未送信', awaiting_approval: '本人の承認待ち', dispatch_pending: 'クラウドへの配送待ち', running: 'Agentが実行中', reconciliation_required: '結果を照合してください', review_results: '成果の確認待ち', needs_attention: '要確認' }[result.controller.state];
      const excerpts = await resultExcerpts(job);
      const summary = `Agent仕事: ${job.id}\n${result.stop.requested ? result.stop.confirmed ? '停止確認済み' : '停止要求済み・外部確認待ち' : `状態: ${job.status === 'completed' ? '本人が成果を確認済み・完了' : stateName}`}\n${result.children.map(c => `${c.agentName} v${c.agentVersion}: ${c.state} / 保存成果${c.artifactCount}件 / 成果検査 ${c.inspection.status}${c.supersededBy ? ` / 修正成果 ${c.supersededBy} で置換（元成果・明細保持）` : ''}（形式・指定条件のみ、真偽/意味品質は未検証） / ${c.usage?.amountMinor == null ? '使用額未確定' : `${c.usage.amountMinor} ${c.usage.currency} minor（請求照合前）`}`).join('\n')}\n予算予約・実使用量・Provider請求・入金・作者支払いは別記録です。`;
      await history.save({ session: { ...current.session, activeRequest: null, messages: [
        { id: `agent-goal-${job.id}`, side: 'me', text: job.plan.objective },
        { id: `agent-work-${job.id}`, side: 'sky', text: `${summary}\n${result.children.filter(c => c.usageProvenance).map(c => { const p = c.usageProvenance!; return `利用元: ${p.delegationId} / receipt ${p.receiptReference} / SHA256 ${p.receiptSha256}${p.package ? ` / Package ${p.package.packageKey} / 登録作者 ${p.package.registeredPublisherId}` : ` / ${p.status === 'agent_only' ? 'Packageとの対応は未登録' : 'Package・作者の対応を照合できません'}`} / ${c.usageSourceState === 'source_conflict' ? '保存時の利用元を保持・現在の登録情報との照合待ち' : c.usageSourceState === 'captured' ? '利用元を仕事へ固定保存済み' : '利用元は未固定'}${c.usageBindingStatus === 'revoked' ? ' / 実行bindingは現在失効' : ''}${c.authorAllocation ? ` / 作者料 ${c.authorAllocation.allocation.grossMinor}・手数料 ${c.authorAllocation.allocation.commissionMinor}・作者受取候補 ${c.authorAllocation.allocation.payableMinor} ${c.authorAllocation.currency} minor（請求・入金未照合）` : ''}${c.collectionConsent ? ' / 請求準備の本人アカウント確認記録あり（現在の条件は明細で再照合・入金未確認）' : ''} / 作者報酬: ${c.authorAgreementStatus === 'agreement_bound_pending_collection' ? '契約署名照合済み・請求と入金の照合待ち' : c.authorAgreementStatus === 'agreement_unavailable' ? '保存済み契約の有効性を再確認・金額未確定' : '契約未登録・金額未確定'}`; }).join('\n')}\n${result.children.flatMap(c => c.inspection.checks.map(check => `${check.passed ? '合格' : '未達'}: ${check.name} — ${check.detail}`)).join('\n')}\n${excerpts}`.slice(0, 32000) },
      ] }, revision: current.revision, remember: current.remember }, { jobId: job.id, revision: job.revision, kind: 'agent' });
    } catch { historySaved = false; }
    return { ...result, historySaved };
  }
  async function settleStop(job: WorkJob) {
    if (job.eveAgent?.stopRequestedAt === undefined || job.status === 'cancelled') return job;
    const children = await agents.listForParent(owner, job.id);
    if (children.some(child => !terminal.has(child.state))) {
      const probe = probeEveAgentStop(job);
      if (!await works.update(owner, probe, job.revision)) return get(job.id);
      job = probe;
    }
    for (const child of children) {
      if (terminal.has(child.state)) continue;
      // Re-read/CAS in the existing store. A race leaves the durable intent pending.
      try { await agents.requestCancel(owner, child.id); } catch { /* Reconcile on next sync. */ }
    }
    const latest = await agents.listForParent(owner, job.id);
    if (latest.some(child => !terminal.has(child.state))) return job;
    const current = await get(job.id);
    if (current.status === 'cancelled') return current;
    const next = applyWorkCommand(current, { id: current.eveAgent!.stopCommandId!, action: 'cancel' }, current.revision);
    if (!await works.update(owner, next, current.revision)) return get(job.id);
    return next;
  }
  return {
    async create(raw: unknown) {
      if (!history) throw new WorkError('会話の暗号化保管へ接続できません。', 503);
      const v = objectInput(raw, ['jobId', 'threadId', 'title', 'create', 'acceptance']);
      if (v.create !== true) throw new WorkError('Eveから新しいAgent仕事を作成してください。');
      const id = workId(v.jobId), threadId = eveThreadId(v.threadId);
      const draft = createWorkJob({ id, title: v.title, templateId: 'cloud-agent' });
      const acceptance = parseEveAgentCriteria(v.acceptance);
      const requestBytes = new TextEncoder().encode(JSON.stringify({ threadId, title: draft.title, templateId: draft.templateId, ...(v.acceptance === undefined ? {} : { acceptance }) }));
      const requestSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', requestBytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      const old = await works.get(owner, id);
      if (old) {
        if (old.eveAgent?.creationRequestSha256 !== requestSha256 || old.eveAgent.threadId !== threadId) throw new WorkError('同じ仕事IDの作成内容が異なります。', 409);
        return publish(old);
      }
      const job = bindEveAgentWork(draft, threadId, draft.revision);
      job.eveAgent = { ...job.eveAgent!, creationRequestSha256: requestSha256, acceptance };
      try { await history.get(threadId); }
      catch (error) {
        if (!(error instanceof EveHistoryError) || error.status !== 404) throw error;
        await history.save({ session: { version: 1, id: threadId, toolId: 'sky-auto', createdAt: Date.now(), messages: [{ id: `agent-goal-${id}`, side: 'me', text: job.plan.objective }], activeRequest: null, workflowStatus: 'ready', outcome: null }, revision: 0, remember: false });
      }
      // The first saved WorkJob already carries its conversation binding. There
      // is no unbound parent between two client requests and no external grant.
      const saved = await works.create(owner, job);
      if (!saved || saved.eveAgent?.creationRequestSha256 !== requestSha256 || saved.eveAgent.threadId !== threadId) throw new WorkError('仕事IDが使用されています。', 409);
      return publish(saved);
    },
    async list(threadId: string) {
      eveThreadId(threadId);
      return (await works.list(owner)).filter(job => job.eveAgent?.threadId === threadId);
    },
    async read(id: unknown, includeAgreementDocuments = false) { return snapshot(await get(id), includeAgreementDocuments); },
    async bind(raw: unknown) {
      if (!history) throw new WorkError('会話の暗号化保管へ接続できません。', 503);
      const v = objectInput(raw, ['jobId', 'threadId', 'revision']);
      if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0) throw new WorkError('仕事の版を確認してください。');
      const threadId = eveThreadId(v.threadId), job = await get(v.jobId, false);
      const next = bindEveAgentWork(job, threadId, Number(v.revision));
      try { await history.get(threadId); }
      catch (error) {
        if (!(error instanceof EveHistoryError) || error.status !== 404) throw error;
        // The history store rejects tombstones; a fresh thread stays owner-scoped.
        await history.save({ session: { version: 1, id: threadId, toolId: 'sky-auto', createdAt: Date.now(), messages: [{ id: `agent-goal-${job.id}`, side: 'me', text: job.plan.objective }], activeRequest: null, workflowStatus: 'ready', outcome: null }, revision: 0, remember: false });
      }
      if (next !== job && !await works.update(owner, next, job.revision)) throw new WorkError('仕事を再読込してください。', 409);
      return publish(next);
    },
    async command(raw: unknown) {
      const v = objectInput(raw, ['jobId', 'revision', 'commandId', 'action', 'sourceDelegationId', 'authorAgreement', 'termsText', 'statementDigest', 'amountMinor', 'currency', 'confirmed']);
      let job = await get(v.jobId);
      if(v.action==='record-agent-collection-consent') {
        if(!history)throw new WorkError('会話の暗号化保管へ接続してください。',503);
        await history.get(job.eveAgent!.threadId);
        const id=workId(v.sourceDelegationId),sources=[...(job.eveAgent?.usageSources??[])],index=sources.findIndex(s=>s.provenance.delegationId===id);
        if(index<0)throw new WorkError('この仕事に保存した利用元を確認してください。',409);
        let statement;
        try {statement=await agentUsageStatement(db,owner,id,authorAgreementKeys);}
        catch(error){if(error instanceof SkyPaymentError)throw new WorkError(error.message,error.status);throw error;}
        const plan=statement.collectionPlan;
        if(statement.parentJobId!==job.id || statement.jobRevision!==job.revision || !plan || plan.mode!=='platform_invoice' || plan.platformInvoiceCandidateMinor===null)
          throw new WorkError('同じ仕事のRockstar請求候補を読み直してください。',409);
        if(v.confirmed!==true || v.statementDigest!==statement.digest || v.amountMinor!==plan.platformInvoiceCandidateMinor || v.currency!==statement.currency)
          throw new WorkError('表示した明細・通貨・金額を確認してから記録してください。',409);
        const expected={ownerId:owner,sourceId:id,statementDigest:statement.digest,allocationCandidateId:statement.allocationCandidateId,agreementSha256:statement.agreementSha256,receiptSha256:statement.receiptSha256,amountMinor:plan.platformInvoiceCandidateMinor,currency:statement.currency};
        const old=sources[index].collectionConsent;
        if(old){if(!collectionConsentMatches(old,expected))throw new WorkError('保存した確認条件が変わっています。請求せず照合してください。',409);return publish(job);}
        if(v.revision!==job.revision)throw new WorkError('仕事を再読込してください。',409);
        const consent:AgentCollectionConsent={schema:'sky.agent-collection-consent/1',id:await sha256Hex(JSON.stringify({domain:'sky.agent-collection-consent/1',...expected})),...expected,recordedAt:new Date().toISOString(),status:'recorded_pending_invoice_reconciliation'};
        sources[index]={...sources[index],collectionConsent:consent};
        const next={...job,eveAgent:{...job.eveAgent!,usageSources:sources},revision:job.revision+1,updatedAt:new Date().toISOString()};
        const bound=sources[index].authorAgreement!;
        if(!await works.update(owner,next,job.revision,undefined,{...bound.agreement,agreementSha256:bound.agreementSha256}))throw new WorkError('仕事または契約が変わりました。再読込してください。',409);
        return publish(next);
      }
      if (v.action === 'bind-author-agreement' || v.action === 'register-author-agreement' || v.action === 'prepare-author-allocation') {
        if (!history) throw new WorkError('会話の暗号化保管へ接続してください。',503);
        await history.get(job.eveAgent!.threadId);
        if (job.eveAgent?.stopRequestedAt !== undefined || job.status === 'cancelled') throw new WorkError('停止済みの仕事へ新しい契約を結べません。',409);
        const id=workId(v.sourceDelegationId), sources=[...(job.eveAgent?.usageSources ?? [])];
        const index=sources.findIndex(s=>s.provenance.delegationId===id);
        if(index<0) throw new WorkError('先に利用元を同じ仕事へ固定保存してください。',409);
        const current=await observeAgentUsageProvenance(db,owner,job.id,id);
        const resolved=resolveCapturedAgentUsageSource(sources[index],current);
        if(resolved.state!=='captured' || resolved.currentBindingStatus!=='active') throw new WorkError('保存時と現在の利用元を照合してから契約を結んでください。',409);
        const binding=await verifyAuthorUsageAgreement(v.action==='prepare-author-allocation' ? sources[index].authorAgreement?.agreement : v.authorAgreement,sources[index],authorAgreementKeys);
        const documents=authorAgreementDocuments(db);
        if(v.action==='register-author-agreement') {
          const document=await documents.register(v.authorAgreement,v.termsText,sources[index],authorAgreementKeys);
          return {...await publish(job),agreementDocument:document};
        }
        if(v.action==='prepare-author-allocation') {
          const document=await documents.valid(binding.agreement,binding.agreementSha256);
          if(!document || !sources[index].authorAgreement || sources[index].authorAgreement!.agreementSha256!==binding.agreementSha256) throw new WorkError('登録本文と利用元への契約結合を確認してください。',409);
          const candidate=await prepareAuthorAllocation(db,owner,job.id,sources[index],document.termsText);
          const old=sources[index].authorAllocation;
          if(old) {if(JSON.stringify({...old,preparedAt:''})!==JSON.stringify({...candidate,preparedAt:''}))throw new WorkError('保存済みの配分条件が変わっています。再配分せず照合してください。',409);return publish(job);}
          if(v.revision!==job.revision)throw new WorkError('仕事を再読込してください。',409);
          sources[index]={...sources[index],authorAllocation:candidate};
          const next={...job,eveAgent:{...job.eveAgent!,usageSources:sources},revision:job.revision+1,updatedAt:new Date().toISOString()};
          if(!await works.update(owner,next,job.revision,undefined,{...binding.agreement,agreementSha256:binding.agreementSha256}))throw new WorkError('仕事または契約が変わりました。再読込してください。',409);
          return publish(next);
        }
        const existing=sources[index].authorAgreement;
        if(existing) {
          if(existing.agreementSha256!==binding.agreementSha256 || existing.receiptSha256!==binding.receiptSha256) throw new WorkError('利用元は別の契約へ結合済みです。再結合せず確認してください。',409);
          if(!await documents.valid(binding.agreement,binding.agreementSha256)) throw new WorkError('双方が署名した契約本文を登録・照合してから結合してください。',409);
          return publish(job);
        }
        if(!await documents.valid(binding.agreement,binding.agreementSha256)) throw new WorkError('双方が署名した契約本文を登録・照合してから結合してください。',409);
        if(v.revision!==job.revision) throw new WorkError('仕事を再読込してください。',409);
        sources[index]={...sources[index],authorAgreement:binding};
        const next={...job,eveAgent:{...job.eveAgent!,usageSources:sources},revision:job.revision+1,updatedAt:new Date().toISOString()};
        if(!await works.update(owner,next,job.revision,undefined,{...binding.agreement,agreementSha256:binding.agreementSha256})) throw new WorkError('仕事または契約の有効性が変わりました。同じ仕事を再読込してください。',409);
        return publish(next);
      }
      if (v.action === 'prepare-repair') {
        if (!history) throw new WorkError('会話の暗号化保管へ接続してから修正してください。', 503);
        if (!['active', 'review'].includes(job.status) || job.eveAgent?.stopRequestedAt !== undefined) throw new WorkError('作業中の停止要求がない仕事だけを修正できます。',409);
        await history.get(job.eveAgent!.threadId);
        const sourceId=workId(v.sourceDelegationId), commandId=workId(v.commandId);
        if(job.events.some(e=>e.command.id===commandId)) throw new WorkError('同じ操作IDを別の操作へ使えません。',409);
        const old=(job.eveAgent!.repairs??[]).find(r=>r.sourceDelegationId===sourceId);
        if ((job.eveAgent!.repairs??[]).some(r=>r.commandId===commandId && r.sourceDelegationId!==sourceId)) throw new WorkError('同じ操作IDで別の成果を修正できません。',409);
        const draft=await buildEveAgentRepairDraft(db,owner,job,sourceId,artifactKey);
        if(old && (old.messageSha256!==draft.messageSha256 || old.criteriaSha256!==draft.criteriaSha256 || old.objectiveSha256!==draft.objectiveSha256 || !sameEveAgentArtifacts(old.sourceArtifacts,draft.inspection.artifacts))) throw new WorkError('元成果または固定条件が変わっています。再送せず状態を確認してください。',409);
        let repair=old;
        if(!repair) {
          if(v.revision!==job.revision) throw new WorkError('仕事を再読込してください。',409);
          if((job.eveAgent!.repairs??[]).length>=EVE_AGENT_MAX_REPAIRS) throw new WorkError('限定修正の上限に達しました。条件を緩めず停止・確認してください。',409);
          const children=await agents.listForParent(owner,job.id);
          if(children.length>=A2A_MAX_DELEGATIONS_PER_PARENT_JOB) throw new WorkError('この仕事のAgent件数上限です。成果を保持して停止・確認してください。',409);
          if(children.some(c=>c.predecessorDelegationId===sourceId)) throw new WorkError('元成果には既に次の委任があります。同じ委任を確認してください。',409);
          const successorDelegationId=crypto.randomUUID();
          repair={commandId,sourceDelegationId:sourceId,successorDelegationId,messageId:crypto.randomUUID(),idempotencyKey:`eve-repair:${job.id}:${successorDelegationId}`,messageSha256:draft.messageSha256,criteriaSha256:draft.criteriaSha256,objectiveSha256:draft.objectiveSha256,deadlineAt:draft.deadlineAt,sourceArtifacts:draft.inspection.artifacts,preparedAt:new Date().toISOString()};
          const next={...job,eveAgent:{...job.eveAgent!,repairs:[...(job.eveAgent!.repairs??[]),repair]},revision:job.revision+1,updatedAt:new Date().toISOString()};
          if(!await works.update(owner,next,job.revision,[{delegationId:sourceId,artifacts:draft.inspection.artifacts}])) throw new WorkError('仕事または元成果が変更されました。再読込してください。',409);
          job=next;
        }
        return {...await publish(job),repairDraft:{...repair,message:draft.message}};
      }
      if (v.action === 'stop') {
        if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0) throw new WorkError('仕事の版を確認してください。');
        const next = requestEveAgentStop(job, workId(v.commandId), Number(v.revision));
        if (next !== job && !await works.update(owner, next, job.revision)) throw new WorkError('仕事を再読込してください。', 409);
        job = next;
      } else if (v.action !== 'sync') throw new WorkError('停止または照合を選んでください。');
      job = await settleStop(job);
      // Stop recovery is independent of optional attribution persistence.
      if (v.action === 'sync' && job.eveAgent?.stopRequestedAt === undefined && job.status !== 'cancelled') {
        const sources = [...(job.eveAgent!.usageSources ?? [])];
        for (const child of await agents.listForParent(owner, job.id)) {
          if (sources.some(s => s.provenance.delegationId === child.id)) continue;
          const provenance = await observeAgentUsageProvenance(db, owner, job.id, child.id);
          if (provenance) sources.push({ capturedAt: new Date().toISOString(), provenance });
        }
        if (sources.length !== (job.eveAgent!.usageSources ?? []).length) {
          const next = { ...job, eveAgent: { ...job.eveAgent!, usageSources: sources }, revision: job.revision + 1, updatedAt: new Date().toISOString() };
          if (!await works.update(owner, next, job.revision)) throw new WorkError('仕事が更新されました。同じ仕事を再読込してください。', 409);
          job = next;
        }
      }
      return publish(job);
    },
  };
}

/** Recover owner stop intents using existing WorkJob/A2A state; no execution grants or history keys. */
export async function reconcileEveAgentStops(db: Pick<D1Database, 'prepare' | 'batch'>, limit = 50) {
  const parents = await a2aDelegationStore(db).listEveStoppingParents(limit);
  let failed = 0;
  for (const parent of parents) {
    try { await eveAgentWorkStore(db, parent.ownerUserId).command({ jobId: parent.id, action: 'sync' }); }
    catch { failed++; } // The durable intent remains pending for a later scan.
  }
  return { scanned: parents.length, failed };
}
