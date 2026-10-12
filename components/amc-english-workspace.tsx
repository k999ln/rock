'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import styles from './sky-columbia-tools.module.css';

type Phase = 'goal' | 'plan' | 'work' | 'review' | 'accepted';
type SavedAmc = {
  goal: string;
  intent: string;
  notes: string;
  workNotes: string;
  evidence: string;
  reviewNote: string;
  phase: Phase;
  updatedAt: string;
};

const STORAGE_KEY = 'sky-amc-english-draft-v1';
const phaseLabels: Record<Phase, string> = {
  goal: 'Goal draft',
  plan: 'Plan ready',
  work: 'Work in progress',
  review: 'Waiting for review',
  accepted: 'Review accepted',
};
const planTemplate = [
  'Define the smallest useful deliverable and its owner.',
  'Complete the work while recording decisions and evidence.',
  'Check the acceptance criteria before submitting for review.',
];
const reviewCriteria = [
  'The requested deliverable exists and matches the goal.',
  'Evidence identifies what was checked and what remains uncertain.',
  'The owner has an explicit accept, revise, or hold decision.',
];

function emptyDraft(): SavedAmc {
  return { goal: '', intent: '', notes: '', workNotes: '', evidence: '', reviewNote: '', phase: 'goal', updatedAt: '' };
}

export default function AmcEnglishWorkspace({ cardEntry = false }: { cardEntry?: boolean }) {
  const [draft, setDraft] = useState<SavedAmc>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const campus = SKY_CAMPUS_ENTRIES.columbia;
  const phaseIndex = useMemo(() => ['goal', 'plan', 'work', 'review', 'accepted'].indexOf(draft.phase), [draft.phase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<SavedAmc>;
          if (saved && typeof saved.goal === 'string' && typeof saved.phase === 'string') {
            const phases: Phase[] = ['goal', 'plan', 'work', 'review', 'accepted'];
            setDraft({ ...emptyDraft(), ...saved, phase: phases.includes(saved.phase as Phase) ? saved.phase as Phase : 'goal' });
          }
        }
      } catch { /* local persistence is optional and must never block the tool */ }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })); }
    catch { /* private browsing may disable local persistence */ }
  }, [draft, hydrated]);

  function update(patch: Partial<SavedAmc>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function createPlan(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.goal.trim().length < 3) return;
    update({ goal: draft.goal.trim(), intent: draft.intent.trim(), notes: draft.notes.trim(), phase: 'plan' });
  }

  function startWork() { update({ phase: 'work' }); }
  function submitForReview(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.evidence.trim().length < 3) return;
    update({ workNotes: draft.workNotes.trim(), evidence: draft.evidence.trim(), phase: 'review' });
  }
  function acceptReview(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.reviewNote.trim().length < 3) return;
    update({ reviewNote: draft.reviewNote.trim(), phase: 'accepted' });
  }
  function reset() { setDraft(emptyDraft()); }

  return (
    <main lang="en" className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{cardEntry ? `SKY · ${campus.name.toUpperCase()}` : 'SKY · AMC'}</p>
        <h1>AMC</h1>
        <p className={styles.lede}>
          {cardEntry
            ? `Create a reviewable ${campus.name} plan. This entry stays local: it does not call an LLM or a paid external runner.`
            : 'Create a reviewable plan from a goal. This English workspace records explicit transitions and does not call an LLM or a paid external runner.'}
        </p>

        <section className={styles.panel} aria-label="AMC workflow status">
          <div className={styles.workflowSteps}>
            {(['goal', 'plan', 'work', 'review', 'accepted'] as Phase[]).map((phase, index) => (
              <span className={index <= phaseIndex ? styles.workflowStepActive : styles.workflowStep} key={phase}>
                {index + 1}. {phaseLabels[phase]}
              </span>
            ))}
          </div>
          <p className={styles.muted}>Current state: <strong>{phaseLabels[draft.phase]}</strong>. This preview persists transitions locally in this browser. It does not write account-owned Zema state or trigger an external runner; use the signed-in AMC workspace when that shared record is required.</p>
        </section>

        {draft.phase === 'goal' && (
          <form className={styles.panel} onSubmit={createPlan}>
            <h2>1. Define the goal</h2>
            <label className={styles.field}>Goal<input required minLength={3} value={draft.goal} onChange={(event) => update({ goal: event.target.value })} placeholder="What should be true when this is done?" maxLength={500} /></label>
            <label className={styles.field}>Intent<textarea value={draft.intent} onChange={(event) => update({ intent: event.target.value })} placeholder="Why does this matter?" maxLength={2000} /></label>
            <label className={styles.field}>Notes<textarea value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Constraints, evidence, or open questions" maxLength={2000} /></label>
            <button type="submit" className={styles.button}>Create plan</button>
          </form>
        )}

        {draft.phase !== 'goal' && (
          <section className={styles.panel} aria-label="AMC goal and plan">
            <h2>{draft.goal}</h2>
            {draft.intent && <p className={styles.muted}><strong>Intent:</strong> {draft.intent}</p>}
            {draft.notes && <p className={styles.muted}><strong>Notes:</strong> {draft.notes}</p>}
            <h3>Plan template</h3>
            <ol>{planTemplate.map((step) => <li key={step}>{step}</li>)}</ol>
            <h3>Review gate</h3>
            <ul>{reviewCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            {draft.phase === 'plan' && <button type="button" className={styles.button} onClick={startWork}>Start work</button>}
          </section>
        )}

        {draft.phase === 'work' && (
          <form className={styles.panel} onSubmit={submitForReview}>
            <h2>2. Do the work</h2>
            <p className={styles.muted}>Record work and evidence before moving to the waiting-for-review state. Saving this draft does not claim that the work passed.</p>
            <label className={styles.field}>Work notes<textarea value={draft.workNotes} onChange={(event) => update({ workNotes: event.target.value })} placeholder="What changed? What did you check?" maxLength={4000} /></label>
            <label className={styles.field}>Evidence for review<textarea required minLength={3} value={draft.evidence} onChange={(event) => update({ evidence: event.target.value })} placeholder="Links, files, measurements, or checks" maxLength={4000} /></label>
            <button type="submit" className={styles.button}>Submit for review</button>
          </form>
        )}

        {draft.phase === 'review' && (
          <form className={styles.panel} onSubmit={acceptReview}>
            <h2>3. Waiting for review</h2>
            <p className={styles.muted}><strong>Evidence:</strong> {draft.evidence}</p>
            <label className={styles.field}>Review decision<textarea required minLength={3} value={draft.reviewNote} onChange={(event) => update({ reviewNote: event.target.value })} placeholder="Accept the result, request a revision, or record why it is on hold" maxLength={2000} /></label>
            <div className={styles.actions}>
              <button type="submit" className={styles.button}>Accept review gate</button>
              <button type="button" className={styles.download} onClick={() => update({ phase: 'work' })}>Return to work</button>
            </div>
          </form>
        )}

        {draft.phase === 'accepted' && (
          <section className={styles.panel} aria-label="Accepted AMC plan">
            <h2>4. Review accepted</h2>
            <p className={styles.muted}>The goal, work evidence, and review decision are recorded locally in this preview. This is a review record, not proof of external execution or a substitute for account-owned Zema persistence.</p>
            <p><strong>Decision:</strong> {draft.reviewNote}</p>
            <p><strong>Evidence:</strong> {draft.evidence}</p>
            <button type="button" className={styles.download} onClick={() => update({ phase: 'work' })}>Reopen for revision</button>
          </section>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.download} onClick={reset}>Start a new local draft</button>
          <a className={styles.privacy} href={campus.privacyUrl} target="_blank" rel="noreferrer">Privacy and processing details</a>
        </div>
      </div>
    </main>
  );
}
