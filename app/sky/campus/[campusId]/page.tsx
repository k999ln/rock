import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import styles from './page.module.css';

type Props = { params: Promise<{ campusId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { campusId } = await params;
  const entry = campusId === 'columbia' ? SKY_CAMPUS_ENTRIES.columbia : null;
  return entry
    ? { title: entry.heading, description: entry.description }
    : { title: 'Sky Campus' };
}

export default async function SkyCampusPage({ params }: Props) {
  const { campusId } = await params;
  const entry = campusId === 'columbia' ? SKY_CAMPUS_ENTRIES.columbia : null;
  if (!entry) notFound();
  return (
    <main lang="en" className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.kicker}>SKY · {entry.name}</p>
        <h1>{entry.heading}</h1>
        <p className={styles.lede}>{entry.description}</p>
        <p className={styles.access}>No sign-in is required to read this page or the tool descriptions.</p>
      </header>
      <section className={styles.tools} aria-labelledby="tools-heading">
        <h2 id="tools-heading">Choose a tool</h2>
        <div className={styles.grid}>
          {entry.tools.map((tool) => (
            <article className={styles.card} key={tool.id}>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <dl>
                <div><dt>Cost</dt><dd>{tool.cost}</dd></div>
                <div><dt>Data processing</dt><dd>{tool.processing}</dd></div>
              </dl>
              <Link className={styles.open} href={tool.href}>Open {tool.title}</Link>
            </article>
          ))}
        </div>
      </section>
      <footer className={styles.footer}>
        <Link href="/signin-with-chatgpt?return_to=%2Fsky%2Fcampus%2Fcolumbia">Create a free account or sign in</Link>
        <a href={entry.privacyUrl} target="_blank" rel="noreferrer">Privacy and processing details</a>
        <p>Cards only open this public page. They do not grant access, store personal data, or add account permissions.</p>
      </footer>
    </main>
  );
}
