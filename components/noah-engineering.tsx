'use client';
/* oxlint-disable next/no-html-link-for-pages -- Stage navigation respects the editor's native unsaved-changes prompt. */
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Code2, Monitor, Plug, Play, Store } from 'lucide-react';
import type { NoahUpload } from '@/lib/noah-agent-store';
import { noahSignInHref } from '@/lib/noah-navigation';
import { eveEngineeringNavigation } from '@/lib/eve-engineering-navigation';
import { noahEngineeringHref, noahEngineeringSteps, type NoahEngineeringStep } from '@/lib/noah-engineering';
import NoahAgentUploadForm from './noah-agent-upload-form';
import NoahAgentDetail from './noah-agent-detail';
import NoahPublisher from './noah-publisher';
import NoahEngineeringEve from './noah-engineering-eve';
import type { NoahLocale } from '@/lib/noah-i18n';
import { useNoahLocale } from './noah-locale';
import columns from './noah-engineering-columns.module.css';
import styles from './noah-engineering.module.css';

const actions = {
  create: { label: '自分のAgentを作る', Icon: Code2 },
  connect: { label: '外部Agentをつなぐ', Icon: Plug },
  test: { label: '動きを試す', Icon: Play },
  publish: { label: 'ストアに載せる', Icon: Store },
} as const;

type OwnerAgents =
  | { status: 'loading' | 'signedOut' | 'error' }
  | { status: 'ready'; agents: NoahUpload[] };

function RegisteredAgent({ step, agent }: { step: 'test' | 'publish'; agent: string | null }) {
  const { t } = useNoahLocale();
  const [result, setResult] = useState<OwnerAgents>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const returnTo = noahEngineeringHref(step, agent);
  useEffect(() => {
    const controller = new AbortController();
    const options = { cache: 'no-store' as const, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) };
    async function readOwnerAgents() {
      const response = await fetch('/api/noah/agents', options);
      if (response.status === 401) return { status: 'signedOut' } as const;
      if (!response.ok) throw new Error('list');
      const { agents, ownerScope } = await response.json() as { agents: NoahUpload[]; ownerScope: string };
      if (!Array.isArray(agents) || !ownerScope) throw new Error('list');
      // A bookmarked Agent can be older than the most recent page of uploads.
      if (agent && !agents.some(item => item.id === agent)) {
        const single = await fetch('/api/noah/agents/' + encodeURIComponent(agent), options);
        if (single.ok) {
          const item = await single.json() as { agent: NoahUpload; ownerScope: string };
          if (item.ownerScope !== ownerScope || item.agent.id !== agent) throw new Error('owner');
          agents.push(item.agent);
        } else if (single.status !== 404 && single.status !== 403) throw new Error('detail');
      }
      return { status: 'ready' as const, agents: agents.filter(item => item.uploadState === 'ready') };
    }
    readOwnerAgents().then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(() => { if (!controller.signal.aborted) setResult({ status: 'error' }); });
    return () => controller.abort();
  }, [agent, attempt]);

  if (result.status === 'signedOut') return <a className={styles.textLink} href={noahSignInHref(returnTo)}>{t('サインインして続ける')} <ArrowRight size={16} /></a>;
  if (result.status === 'error') return <div className={styles.status} role="alert">
    {t('自分のAgentを読み込めませんでした。')} <button type="button" onClick={() => { setResult({ status: 'loading' }); setAttempt(value => value + 1); }}>{t('読み直す')}</button>
  </div>;
  if (result.status !== 'ready') return <output>{t('読み込み中…')}</output>;
  const selected = result.agents.find(item => item.id === agent);
  return <>
    {agent && !selected && <output>{t('この登録版を開けません。本人の一覧から選び直してください。')}</output>}
    {result.agents.length ? <label className={styles.select}>{t('登録済みのAgentを選ぶ')}
      <select value={selected?.id ?? ''} onChange={event => {
        if (event.target.value) window.location.assign(noahEngineeringHref(step, event.target.value) + '#engineering-work');
      }}>
        <option value="">{t('Agentを選択')}</option>
        {result.agents.map(item => <option key={item.id} value={item.id}>{item.manifest.name} · v{item.manifest.version}</option>)}
      </select>
    </label> : <div className={styles.empty}>
      <p>{t('最初にAgentを作るか、外部Agentをつないでください。')}</p>
      <a href={noahEngineeringHref('create')}>{t(actions.create.label)} <ArrowRight size={16} /></a>
      <a href={noahEngineeringHref('connect')}>{t(actions.connect.label)} <ArrowRight size={16} /></a>
    </div>}
    {selected && (step === 'publish'
      ? <NoahPublisher key={selected.id} engineeringAgentId={selected.id} />
      : <>
        <NoahAgentDetail key={selected.id} id={selected.id} remote engineering />
        <a className={styles.next} href={noahEngineeringHref('publish', selected.id) + '#engineering-work'}>{t('このAgentをストアに載せる')} <ArrowRight size={17} /></a>
      </>)}
  </>;
}

export default function NoahEngineering({ step, agent, draftLocale }: { step: NoahEngineeringStep | null; agent: string | null; draftLocale?: NoahLocale }) {
  const { t, locale } = useNoahLocale();
  const links = eveEngineeringNavigation(step, draftLocale ?? locale);
  const [actionsOpen, setActionsOpen] = useState(false);
  return <div className={`${styles.page} ${columns.container}`}>
    <header className={styles.heading}>
      <a className={styles.back} href="/noah"><ArrowLeft size={15} />{t('ストア')}</a>
      <h1>{t('Agentエンジニアリング')}</h1>
    </header>
    <div className={columns.columns} data-engineering-columns>
      <div className={`${styles.chooser} ${columns.secondary}`} data-engineering-secondary data-actions-open={actionsOpen}>
        <button type="button" className={styles.toggle} aria-expanded={actionsOpen} aria-controls="engineering-actions" onClick={() => setActionsOpen(open => !open)}>
          <span>{t('作業を選ぶ')}</span>{step && <small>{t(actions[step].label)}</small>}<ChevronDown size={18} aria-hidden="true" />
        </button>
        <div id="engineering-actions" className={styles.tools}>
          <nav className={styles.actions} aria-label={t('Agentの作業を選ぶ')}>
            {noahEngineeringSteps.map(key => {
              const { label, Icon } = actions[key];
              return <a key={key} href={noahEngineeringHref(key, agent) + '#engineering-work'} aria-current={step === key ? 'step' : undefined}>
                <Icon className={styles.icon} size={22} strokeWidth={1.7} aria-hidden="true" />
                <span>{t(label)}</span><ArrowRight className={styles.arrow} size={16} aria-hidden="true" />
              </a>;
            })}
          </nav>
          <nav className={styles.resources} aria-label="Eve">
            <a href={links.catalog}><BookOpen size={17} aria-hidden="true" />{t('組み合わせ例')}</a>
            <a href={links.device}><Monitor size={17} aria-hidden="true" />{t('自分の端末でEveに相談する')}</a>
          </nav>
        </div>
      </div>
      <div className={columns.primary} data-engineering-primary>
        <NoahEngineeringEve stage={step ?? 'create'} emptyDraft={!step} draftLocale={draftLocale} />
        {step && <section id="engineering-work" aria-labelledby="engineering-work-title" className={styles.work}>
          <h2 id="engineering-work-title">{t(actions[step].label)}</h2>
          {step === 'create' || step === 'connect'
            ? <NoahAgentUploadForm key={step} engineeringMode={step} onRegistered={id => window.location.assign(noahEngineeringHref('test', id) + '#engineering-work')} />
            : <RegisteredAgent key={step + (agent ?? '')} step={step} agent={agent} />}
        </section>}
      </div>
    </div>
  </div>;
}
