/** OS interaction core. Host adapters own authentication, workflow, persistence and execution. */
export type EveWorkReference = { id: string; agentId: string; agentSha256: string; modelSha256: string; input: string };
export type EveWorkObservation = { status: 'running' | 'review' | 'completed' | 'stopped' | 'unknown'; text: string | null };
export type EveWorkPort = {
  prepare(input: string, continuing: () => boolean): Promise<Omit<EveWorkReference, 'id'> | null>;
  start(reference: EveWorkReference): Promise<EveWorkObservation | null>;
  read(reference: EveWorkReference): Promise<EveWorkObservation | null>;
  stop(reference: EveWorkReference): Promise<EveWorkObservation | null>;
  stopExisting?(reference: EveWorkReference): Promise<EveWorkObservation | null>;
};
export type EveInteractionPhase = 'disabled' | 'standby' | 'listening' | 'review' | 'creating' | 'running' | 'result' | 'stopping' | 'unknown';
export const EVE_INTERACTION_PENDING = 'rockstaros.eve.interaction.pending.v1';
type Pending = EveWorkReference;
export type EveInteractionState = { phase: EveInteractionPhase; request: string; message: string; result: string; jobId: string };
const normalized = (text: string) => text.normalize('NFKC').trim().toLowerCase().replace(/[.!?。、！？，,]+$/gu, '').trim();
const messageFor = (error: unknown) => error instanceof Error && /[ぁ-んァ-ヶ一-龠]/u.test(error.message) ? error.message : '接続を確認できません。元の仕事画面で状態を確認してください。';
export function eveInteractionCommand(text: string): 'wake' | 'stop' | 'request' {
  const value = normalized(text);
  if (['hey eve', 'ヘイイヴ', 'ヘイイブ', 'ヘイ イヴ', 'ヘイ イブ'].includes(value)) return 'wake';
  if (['thanks eve', 'サンクスイヴ', 'サンクスイブ', 'サンクス イヴ', 'サンクス イブ'].includes(value)) return 'stop';
  return 'request';
}

/** Input adapter supplies final text only. Speech is never an execution approval. */
export function createEveInteractionSession(options: {
  work: EveWorkPort;
  pendingKey?: string;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  changed: (state: EveInteractionState) => void;
}) {
  const pendingKey = options.pendingKey ?? EVE_INTERACTION_PENDING;
  let state: EveInteractionState = { phase: 'disabled', request: '', message: '声の待ち受けは停止中です。', result: '', jobId: '' };
  let revision = 0, pending: Pending | null = null, inFlight: Promise<void> | null = null, stopping: Promise<void> | null = null, disableRequested = false, knownExisting = false, knownPersisted = false;
  const update = (patch: Partial<EveInteractionState>) => { state = { ...state, ...patch }; options.changed({ ...state }); };
  function checked(value: EveWorkObservation | null) {
    if (value === null) return null;
    if (!value || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'status') || !Object.hasOwn(value, 'text') || !['running', 'review', 'completed', 'stopped', 'unknown'].includes(value.status) || !(value.text === null || (typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 32000)) || (['review', 'completed'].includes(value.status) && value.text === null)) throw Error('仕事の状態と成果を確認できません。元の仕事画面で確認してください。');
    return value;
  }
  function remember(run: EveWorkObservation | null, id: string) {
    if (!run || !pending || pending.id !== id || (knownExisting && knownPersisted)) return;
    knownExisting = true;
    options.storage.setItem(pendingKey, JSON.stringify({...pending,knownExisting:true}));
    knownPersisted = true;
  }
  function decode(raw: string) {
    const stored=JSON.parse(raw),marked=stored&&Object.hasOwn(stored,'knownExisting');
    if(marked&&stored.knownExisting!==true)throw Error('保存記録の版を確認できません。');
    const reference={...stored};if(marked)delete reference.knownExisting;
    if(!reference||Object.keys(reference).length!==5||!['id','agentId','agentSha256','modelSha256','input'].every(k=>Object.hasOwn(reference,k))||typeof reference.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reference.id)||typeof reference.agentId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(reference.agentId)||typeof reference.agentSha256!=='string'||!/^[a-f0-9]{64}$/.test(reference.agentSha256)||typeof reference.modelSha256!=='string'||!/^[a-f0-9]{64}$/.test(reference.modelSha256)||typeof reference.input!=='string'||!reference.input.trim()||reference.input.length>1000)throw Error('保存記録を確認できません。');
    return {reference:reference as Pending,knownExisting:!!marked};
  }
  const observe = (run: EveWorkObservation | null) => {
    if (!run) { update({ phase: 'unknown', message: '依頼が届いたか未確認です。同じ仕事の停止を確認してください。' }); return; }
    if (run.status === 'unknown') { update({ phase: 'unknown', message: '停止できたか未確認です。停止をもう一度確認してください。' }); return; }
    if (['review', 'completed'].includes(run.status) && run.text) update({ phase: 'result', result: run.text, message: '下書きができました。内容を確認し、下の成果一覧から保存できます。' });
    else if (run.status === 'stopped') {
      options.storage.removeItem(pendingKey); pending = null; knownExisting = false; knownPersisted = false;
      update({ phase: 'standby', message: '仕事の停止を確認しました。Hey Eveを待っています。' });
    }
    else update({ phase: 'running', message: 'smisを通して、選んだ実行先が依頼を進めています。Thanks Eveで止められます。' });
  };
  async function refresh() {
    if (!pending || inFlight || state.phase === 'stopping') return;
    const mine = revision, reference = { ...pending };
    try { const run = checked(await options.work.read(reference)); remember(run,reference.id); if (mine === revision) observe(run); }
    catch { if (mine === revision) update({ phase: 'unknown', message: '接続を確認できません。仕事は送り直さず、停止の確認を待っています。' }); }
  }
  async function performStop() {
    revision++;
    update({ phase: 'stopping', message: 'この会話の仕事の停止を確認しています。' });
    // A start response may be late. Never report standby before reconciling its ID.
    await inFlight;
    try {
      if (!pending && options.storage.getItem(pendingKey) !== null) throw Error('保存記録を読めないため、停止は未確認です。対応する版で元の仕事を確認してください。');
      if (pending) {
        let run = checked(await options.work.read({ ...pending }));
        try { remember(run,pending.id); } catch { knownExisting = true; }
        if (!run && knownExisting) throw Error('保存済みの仕事の記録が見つかりません。停止は未確認です。送り直さず復旧を確認してください。');
        // Missing delivery is not a stop receipt. Let the bound adapter persist
        // its same-ID start fence or reconcile a late delivery; require proof below.
        if (!run || !['review', 'completed', 'stopped'].includes(run.status)) {
          if (knownExisting && !options.work.stopExisting) throw Error('この接続では保存済み仕事の停止を照合できません。元の仕事画面で確認してください。');
          run = checked(await (knownExisting ? options.work.stopExisting!({ ...pending }) : options.work.stop({ ...pending })));
          try { remember(run,pending.id); } catch { knownExisting = true; }
        }
        if (!run || !['review', 'completed', 'stopped'].includes(run.status)) throw Error('停止できたか未確認です。停止をもう一度確認してください。');
        if (run.text) update({ result: run.text });
        options.storage.removeItem(pendingKey); pending = null; knownExisting = false; knownPersisted = false;
      }
      update({ phase: disableRequested ? 'disabled' : 'standby', request: '', message: disableRequested ? 'マイクの待ち受けを止めました。担当と成果は残っています。' : '仕事を終えました。Hey Eveを待っています。担当と成果は残っています。' });
    } catch (error) { update({ phase: 'unknown', message: messageFor(error) }); }
  }
  function stop(disable = false) {
    disableRequested ||= disable;
    if (!stopping) stopping = performStop().finally(() => { stopping = null; disableRequested = false; });
    return stopping;
  }
  async function confirm() {
    if (inFlight || state.phase !== 'review' || pending) return;
    try { if (options.storage.getItem(pendingKey) !== null) throw Error('前の依頼の記録があります。元の仕事の停止か成果を確認してください。'); }
    catch (error) { update({ phase: 'unknown', message: messageFor(error) }); return; }
    const input = state.request.trim(), mine = revision;
    if (!input || input.length > 1000) { update({ message: '依頼を1,000文字以内で確認してください。' }); return; }
    update({ phase: 'creating', message: 'Eveが、この依頼を任せる担当を用意しています。' });
    inFlight = (async () => {
      try {
        const prepared = await options.work.prepare(input, () => mine === revision);
        if (mine !== revision) return;
        if (!prepared || Object.keys(prepared).length !== 4 || !['agentId', 'agentSha256', 'modelSha256', 'input'].every(k => Object.hasOwn(prepared, k)) || prepared.input !== input || typeof prepared.agentId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(prepared.agentId) || !/^[a-f0-9]{64}$/.test(prepared.agentSha256) || !/^[a-f0-9]{64}$/.test(prepared.modelSha256)) throw Error('担当と実行先を確認できません。元の仕事画面を確認してください。');
        pending = { id: crypto.randomUUID(), ...prepared }; knownExisting = false; knownPersisted = false;
        try { options.storage.setItem(pendingKey, JSON.stringify(pending)); } catch { pending = null; throw Error('依頼番号を保存できないため、実行を始めませんでした。'); }
        update({ jobId: pending.id });
        const started={...pending};
        const result = checked(await options.work.start(started));
        remember(result,started.id);
        if (mine === revision) observe(result);
      } catch (error) { if (mine === revision) update({ phase: pending ? 'unknown' : 'review', message: messageFor(error) }); }
    })();
    try { await inFlight; } finally { inFlight = null; }
  }
  /** Explicitly inspect a saved job on this client; never prepare or resend it. */
  async function resume(reference: EveWorkReference) {
    if (inFlight || stopping || pending || !['disabled', 'standby'].includes(state.phase)) return;
    const valid = (p: EveWorkReference) => p && Object.keys(p).length === 5 && ['id', 'agentId', 'agentSha256', 'modelSha256', 'input'].every(k => Object.hasOwn(p, k)) && typeof p.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(p.id) && typeof p.agentId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(p.agentId) && typeof p.agentSha256 === 'string' && /^[a-f0-9]{64}$/.test(p.agentSha256) && typeof p.modelSha256 === 'string' && /^[a-f0-9]{64}$/.test(p.modelSha256) && typeof p.input === 'string' && p.input.trim().length > 0 && p.input.length <= 1000;
    try {
      if (!valid(reference)) throw Error('保存済みの仕事の番号と担当を確認できません。');
      const selected: Pending = { id: reference.id, agentId: reference.agentId, agentSha256: reference.agentSha256, modelSha256: reference.modelSha256, input: reference.input };
      const raw = options.storage.getItem(pendingKey);
      if (raw !== null) {
        const previous = decode(raw).reference;
        if (!valid(previous) || Object.keys(selected).some(k => selected[k as keyof Pending] !== previous[k as keyof Pending])) throw Error('別の依頼の記録があります。先に元の仕事の停止か成果を確認してください。');
      }
      options.storage.setItem(pendingKey, JSON.stringify({...selected,knownExisting:true}));
      pending = selected; knownExisting = true; knownPersisted = true;
      const mine = ++revision;
      update({ phase: 'unknown', request: selected.input, jobId: selected.id, result: '', message: '保存済みの仕事を読み直しています。依頼は送り直しません。' });
      inFlight = (async () => {
        try { const run = checked(await options.work.read({ ...selected })); if (mine === revision) observe(run); }
        catch (error) { if (mine === revision) update({ phase: 'unknown', message: messageFor(error) }); }
      })();
      try { await inFlight; } finally { inFlight = null; }
    } catch (error) { update({ phase: 'unknown', message: messageFor(error) }); }
  }
  function arm() {
    if (!['disabled', 'standby'].includes(state.phase)) return;
    try {
      const raw = options.storage.getItem(pendingKey);
      if (raw) {
        const restored = decode(raw),p=restored.reference;
        pending = p; knownExisting = restored.knownExisting; knownPersisted = restored.knownExisting; update({ phase: 'unknown', jobId: p.id, message: '前の依頼の記録があります。送り直さず、停止か成果を確認してください。' }); return;
      }
      update({ phase: 'standby', message: 'Hey Eveと呼びかけてください。' });
    } catch { update({ phase: 'unknown', message: '前の依頼の記録を読めません。元の仕事画面を確認してください。' }); }
  }
  return { arm, confirm, stop, refresh, resume, get state() { return { ...state }; }, hearFinal(text: string) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000 || state.phase === 'disabled') return;
    const command = eveInteractionCommand(text);
    if (command === 'stop') { void stop(); return; }
    if (command === 'wake' && state.phase === 'standby') { revision++; update({ phase: 'listening', request: '', result: '', message: 'はい。何を手伝いましょうか？' }); return; }
    if (command === 'request' && ['listening', 'review'].includes(state.phase)) update({ phase: 'review', request: text.trim(), message: '聞き取った依頼を確認してください。確認ボタンを押すまで担当の作成や実行は始まりません。' });
  } };
}
