import Link from 'next/link';
import { CAMPUSES, CAMPUS_IDS } from '@/lib/campus';
import styles from '@/components/campus-sky.module.css';

export default function CampusSkyPicker() {
  return (
    <main className={styles.page} lang="en">
      <div className={styles.inner}>
        <header className={styles.header}>
          <Link href="/sky" className={styles.brand}>
            avocado <span>/ Sky</span>
          </Link>
        </header>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>SAME CITY. BIGGER IDEAS.</p>
          <h1>
            Your campus.
            <br />
            Your starting point.
          </h1>
          <p>
            Choose your university to open its Sky workspace. A campus NFC tag
            or QR code opens that same workspace directly.
          </p>
        </section>
        <nav className={styles.links} aria-label="Choose your university">
          {CAMPUS_IDS.map((id) => (
            <Link key={id} href={`/sky/campus/${id}/hub`}>
              <strong>{CAMPUSES[id].name}</strong>
              <span>{CAMPUSES[id].headline} ↗</span>
            </Link>
          ))}
        </nav>
        <footer className={styles.footer}>
          An independent avocado community. Not an official university service.
        </footer>
      </div>
    </main>
  );
}
