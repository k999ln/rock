'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Radio,
  Sparkles,
} from 'lucide-react';
import type { CampusConfig } from '@/lib/campus';
import { CAMPUS_STARTERS, buildCampusBrief } from '@/lib/campus-sky';
import { writeHomeIntent } from '@/lib/home-intent';
import SkyMcpPlan from './sky-mcp-plan';
import CampusSkyInstall from './campus-sky-install';
import styles from './campus-sky.module.css';

export default function CampusSky({ campus }: { campus: CampusConfig }) {
  const starter = CAMPUS_STARTERS[campus.id];
  const [values, setValues] = useState(['', '', '']);
  const [brief, setBrief] = useState('');
  const [notice, setNotice] = useState('');
  const campusLink = `/campus?campus=${campus.id}`;
  const hubLink = `/sky/campus/${campus.id}/hub`;
  function download() {
    const url = URL.createObjectURL(
      new Blob([brief], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${campus.id}-project-brief.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openZema() {
    try {
      writeHomeIntent(window.sessionStorage, brief);
      window.location.assign(`/sky/campus/${campus.id}/manage?view=chat`);
    } catch {
      setNotice(
        'Your browser could not transfer the draft. Download it, then open Zema in Sky.',
      );
    }
  }
  return (
    <main
      className={styles.page}
      lang="en"
      style={{ '--campus-accent': campus.accent } as CSSProperties}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <Link href="/sky" className={styles.brand}>
            avocado <span>/ Sky</span>
          </Link>
          <Link className={styles.change} href="/sky/campus">
            Change campus <ArrowUpRight size={14} />
          </Link>
        </header>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>
            <Radio size={16} /> FOR {campus.shortName.toUpperCase()} STUDENTS
          </p>
          <p className={styles.university}>{campus.name}</p>
          <h1>{campus.headline}</h1>
          <p>
            {campus.description} Your tools and projects, right here in your
            browser.
          </p>
          <div className={styles.tags}>
            {campus.focus.slice(0, 3).map((focus) => (
              <span key={focus}>{focus}</span>
            ))}
          </div>
          <div className={styles.actions}>
            <Link href={hubLink} className={styles.primary}>
              Open my agent hub <ArrowUpRight size={17} />
            </Link>
            <a href="#start" className={styles.primary}>
              Start something <ArrowDown size={17} />
            </a>
            <Link href={campusLink}>
              Meet your campus <ArrowUpRight size={17} />
            </Link>
          </div>
          <small>
            No OS installation. No app download. NFC or QR brings you here.
          </small>
        </section>
        <CampusSkyInstall campusName={campus.shortName} />
        <section className={styles.journey} aria-labelledby="campus-journey-title">
          <p className={styles.eyebrow}>SKY / FROM DISCOVERY TO CONTROL</p>
          <h2 id="campus-journey-title">Find it. Buy it. Manage it in Sky.</h2>
          <div className={styles.journeySteps}>
            <Link href={`/sky/marketplace?campus=${campus.id}`}><strong>01 / Sky Market</strong><span>Review the agent package, price, permissions, and supported device.</span></Link>
            <Link href="/sky/purchases"><strong>02 / Purchase</strong><span>Pay through Stripe Checkout. Apple Pay appears only on eligible devices when available. Check the confirmed purchase here.</span></Link>
            <Link href={hubLink}><strong>03 / Agent Hub + Zema</strong><span>See your purchased packages and work. Review, approve, stop, and retrieve results in Sky.</span></Link>
          </div>
          <p className={styles.note}>A paid package grants access only after payment and provider checks. Agent execution and AI usage can have separate approval and charges. Tapping the NFC tag selects this campus; it does not verify your identity or student status.</p>
        </section>
        <section
          className={styles.starter}
          id="start"
          aria-labelledby="starter-title"
        >
          <div>
            <p className={styles.eyebrow}>01 / MAKE A FIRST MOVE</p>
            <h2 id="starter-title">{starter.title}</h2>
            <p>{starter.description}</p>
            <span className={styles.local}>
              <Check size={15} /> Free · works in this browser
            </span>
            <p className={styles.note}>
              This tool formats your own ideas into a brief. It does not call AI
              or send your text anywhere. Download a copy before leaving.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                setBrief(buildCampusBrief(campus.id, values));
                setNotice('Your brief is ready below.');
              } catch (error) {
                setNotice((error as Error).message);
              }
            }}
          >
            {starter.fields.map((field, index) => (
              <label key={field}>
                {field}
                <textarea
                  required
                  maxLength={500}
                  rows={3}
                  placeholder={starter.prompts[index]}
                  value={values[index]}
                  onChange={(event) => {
                    setValues(
                      values.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    );
                    setBrief('');
                    setNotice('');
                  }}
                />
              </label>
            ))}
            <button className={styles.primary} type="submit">
              Create my brief <Sparkles size={16} />
            </button>
          </form>
        </section>
        {brief && (
          <section className={styles.result} aria-label="Your project brief">
            <h2>Your first draft.</h2>
            <pre>{brief}</pre>
            <div className={styles.actions}>
              <button onClick={download}>
                <Download size={16} /> Download
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(brief);
                    setNotice('Copied to clipboard.');
                  } catch {
                    setNotice(
                      'Copy unavailable. Use Download to save your brief.',
                    );
                  }
                }}
              >
                <Copy size={16} /> Copy
              </button>
              <button onClick={openZema}>
                Continue in Sky Zema <ArrowUpRight size={16} />
              </button>
            </div>
            <p className={styles.note}>
              Zema inside Sky lets you review the draft and manage the work. Nothing runs
              automatically; cloud work requires sign-in and any applicable cost
              approval.
            </p>
          </section>
        )}
        <output className={styles.notice}>{notice}</output>
        <section aria-labelledby="explore-title">
          <p className={styles.eyebrow}>02 / BUILD TOGETHER</p>
          <h2 id="explore-title">A place for your next idea.</h2>
          <div className={styles.links}>
            <Link href={`${campusLink}&mode=${starter.mode}`}>
              <strong>{campus.resourceLabel}</strong>
              <span>
                Explore community posts and share your work{' '}
                <ArrowUpRight size={17} />
              </span>
            </Link>
            <Link href={`${campusLink}&mode=social`}>
              <strong>Find your people</strong>
              <span>
                Profiles, interests, and collaborator requests{' '}
                <ArrowUpRight size={17} />
              </span>
            </Link>
            <Link href={`${campusLink}&mode=events`}>
              <strong>On your campus</strong>
              <span>
                Student-posted events and opportunities{' '}
                <ArrowUpRight size={17} />
              </span>
            </Link>
            <Link href={hubLink}>
              <strong>Sky Agent Hub</strong>
              <span>
                Check purchases and manage your agents with Zema{' '}
                <ArrowUpRight size={17} />
              </span>
            </Link>
          </div>
        </section>
        <section className={styles.plan} aria-labelledby="plan-title">
          <p className={styles.eyebrow}>03 / YOUR CONNECTIONS</p>
          <h2 id="plan-title">
            One more connection.
            <br />
            For your campus.
          </h2>
          <p>
            General: 5 free MCP connections. Students at {campus.shortName}: 6
            with a university-email-verified student profile.
          </p>
          <SkyMcpPlan campusId={campus.id} />
          <p className={styles.note}>
            Extra connections are part of a paid plan; pricing and checkout are
            not yet available. AI usage and provider charges are separate.
            External MCP currently requires a connected PC; mobile cloud MCP is
            not available yet.
          </p>
        </section>
        <footer className={styles.footer}>
          <Link href="/sky/help">Help & data controls</Link>
          <p>
            An independent avocado community for {campus.name} students. Not
            affiliated with or endorsed by the university. Selecting a campus
            does not verify student status.
          </p>
          <span>SAME CITY. BIGGER IDEAS.</span>
        </footer>
      </div>
    </main>
  );
}
