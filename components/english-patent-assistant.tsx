'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  assessPatentReadiness,
  buildEnglishPatentPacket,
  type PatentIntakeInput,
} from '@/lib/patent-assistant';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import styles from './sky-columbia-tools.module.css';

type ResearchResult = { answer: string; citations: { title: string; url: string }[] };
const initial: PatentIntakeInput = {
  inventionTitle: '', problem: '', mechanism: '', architecture: '', technicalEffect: '', differences: '', knownPriorArt: '', inventor: '', applicant: '', disclosureStatus: 'not_disclosed', disclosureDate: undefined,
};
const fields: Array<[keyof PatentIntakeInput, string, string]> = [
  ['problem', 'Technical problem', 'What technical problem does the invention solve?'],
  ['mechanism', 'Mechanism', 'Describe the concrete steps, inputs, decisions, and outputs.'],
  ['architecture', 'Architecture and data flow', 'Describe components, devices, services, and data flow.'],
  ['technicalEffect', 'Technical effect', 'What measurable technical effect follows from the mechanism?'],
  ['differences', 'Differences from existing technology', 'Describe the structure, order, condition, or combination that is different.'],
];

export default function EnglishPatentAssistant({ cardEntry = false }: { cardEntry?: boolean }) {
  const [input, setInput] = useState(initial);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [researching, setResearching] = useState(false);
  const assessment = useMemo(() => assessPatentReadiness(input), [input]);
  const campus = SKY_CAMPUS_ENTRIES.columbia;

  function update<K extends keyof PatentIntakeInput>(key: K, value: PatentIntakeInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setOutput('');
    setResearch(null);
    setError('');
  }

  function validTitle() {
    if (input.inventionTitle.trim().length >= 3) return true;
    setError('Enter an invention title of at least three characters.');
    return false;
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validTitle()) return;
    setOutput(buildEnglishPatentPacket(input, assessment, { cardEntry }));
    setError('');
  }

  async function runResearch() {
    if (cardEntry || researching || !validTitle()) return;
    setResearching(true);
    setResearch(null);
    setError('');
    try {
      const response = await fetch('/api/patent-research?lang=en', {
        // Keep the remote request explicitly English even when the page was
        // opened with only lang=en (the Columbia card gate is separate).
        // The API uses this to select an English prompt and response shape.
        // `entry=columbia-card` is intentionally not sent from this surface.
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as ResearchResult & { error?: string };
      if (!response.ok) throw new Error('Official-source research is unavailable right now.');
      setResearch(payload);
    } catch {
      setError('Official-source research is unavailable right now. You can still create a local draft.');
    } finally {
      setResearching(false);
    }
  }

  const download = output ? `data:text/markdown;charset=utf-8,${encodeURIComponent(output)}` : undefined;
  return (
    <main lang="en" className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{cardEntry ? `SKY · ${campus.name.toUpperCase()}` : 'SKY · PATENT ASSISTANT'}</p>
        <h1>Patent Assistant</h1>
        <p className={styles.lede}>
          {cardEntry
            ? 'Create a local invention assessment and English draft packet. This card entry never runs online AI research.'
            : 'Create an English invention assessment and draft packet. Official-source online research is available separately when the account and service gates permit it.'}
        </p>
        <section className={styles.panel}>
          <p className={styles.warning}>{campus.name} research inventions, or inventions made with university resources beyond an incidental level, may belong to the university. Discuss lab inventions with {campus.name} Technology Ventures (CTV) before taking an invention outside the university. Undergraduate inventions made only as coursework are often waived back to the student after a request. This is general information, not legal advice.</p>
          <form onSubmit={submit}>
            <div className={styles.row}>
              <label className={styles.field}>Invention title<input value={input.inventionTitle} onChange={(event) => update('inventionTitle', event.target.value)} placeholder="Working title" maxLength={200} /></label>
              <label className={styles.field}>Inventor candidate<input value={input.inventor} onChange={(event) => update('inventor', event.target.value)} placeholder="Name or team" maxLength={200} /></label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>Applicant candidate<input value={input.applicant} onChange={(event) => update('applicant', event.target.value)} placeholder="Person or organization" maxLength={200} /></label>
              <label className={styles.field}>Disclosure status<select value={input.disclosureStatus} onChange={(event) => update('disclosureStatus', event.target.value as PatentIntakeInput['disclosureStatus'])}><option value="not_disclosed">Not disclosed</option><option value="private_only">Shared only under confidentiality</option><option value="already_disclosed">Already disclosed publicly</option><option value="unknown">Unknown</option></select></label>
            </div>
            {fields.map(([key, label, placeholder]) => (
              <label className={styles.field} key={key}>{label}<textarea value={String(input[key] ?? '')} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} maxLength={2000} /></label>
            ))}
            <label className={styles.field}>Known prior art (optional)<textarea value={input.knownPriorArt} onChange={(event) => update('knownPriorArt', event.target.value)} placeholder="Products, papers, patent publications, or URLs" maxLength={2000} /></label>
            <div className={styles.actions}>
              <button type="submit" className={styles.button}>Create local draft</button>
              {!cardEntry && <button type="button" className={styles.download} disabled={researching} onClick={() => void runResearch()}>{researching ? 'Researching…' : 'Run official-source research'}</button>}
            </div>
            {cardEntry && <p className={styles.notice}>Online AI research is unavailable from this card entry. The draft and US filing guidance remain local and free.</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </form>
        </section>
        {research && <section className={styles.panel} aria-label="Official-source research"><h2>Official-source research</h2><p className={styles.output}>{research.answer}</p><div className={styles.actions}>{research.citations.map((citation) => <a className={styles.download} key={citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>)}</div></section>}
        {output && <section className={styles.panel} aria-label="Patent draft"><h2>Draft packet</h2><p className={styles.muted}>Readiness score: {assessment.score}/100. Review ownership, inventorship, claims, and deadlines with CTV or a qualified patent professional.</p><pre className={styles.output}>{output}</pre><div className={styles.actions}><a className={styles.download} href={download} download="sky-patent-draft.md">Download Markdown</a></div></section>}
        <a className={styles.privacy} href={campus.privacyUrl} target="_blank" rel="noreferrer">Privacy and processing details</a>
      </div>
    </main>
  );
}
