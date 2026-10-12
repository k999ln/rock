'use client';

import { useState, type SyntheticEvent } from 'react';
import { formatCitations } from '@/lib/mr-tools';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import styles from './sky-columbia-tools.module.css';

export default function EnglishCitationsRunner({
  onOutcome,
  executionDisabled = false,
  cardEntry = false,
}: {
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  executionDisabled?: boolean;
  cardEntry?: boolean;
}) {
  const [text, setText] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const campus = SKY_CAMPUS_ENTRIES.columbia;
  function sample() {
    setText('A small experiment is easier to review. (Source: [Python documentation](https://docs.python.org/3/))');
    setOutput('');
    setError('');
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running || executionDisabled) return;
    setRunning(true);
    setError('');
    try {
      const result = formatCitations(text, 'en');
      setOutput(result);
      onOutcome?.({ ok: true, text: result });
    } catch {
      const message = 'Add Markdown source citations before running.';
      setError(message);
      onOutcome?.({ ok: false, text: message });
    } finally {
      setRunning(false);
    }
  }
  return (
    <main lang="en" className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{cardEntry ? `SKY · ${campus.name.toUpperCase()}` : 'SKY · CITATIONS'}</p>
        <h1>Citations</h1>
        <p className={styles.lede}>Organize inline Markdown citations into a readable Sources section. Processing stays in this browser and does not send source text to external services.</p>
        <form className={styles.panel} onSubmit={submit}>
          <label className={styles.field}>
            Markdown text
            <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={100000} placeholder="Write text with (Source: [Label](https://example.com)) citations." rows={10} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.download} onClick={sample}>Use sample</button>
            <button type="submit" className={styles.button} disabled={running || executionDisabled}>{running ? 'Running…' : 'Organize sources'}</button>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
        {output && <section className={styles.panel} aria-label="Formatted result"><h2>Result</h2><pre className={styles.output}>{output}</pre></section>}
        <a className={styles.privacy} href={campus.privacyUrl} target="_blank" rel="noreferrer">Privacy and processing details</a>
      </div>
    </main>
  );
}
