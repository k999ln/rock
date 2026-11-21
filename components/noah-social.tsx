'use client';
import SkySocialTimeline from './sky-social-timeline';
import { noahActionHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-shell.module.css';
export default function NoahSocial({ mode = 'local', base = '/noah' }: { mode?: NoahSurfaceMode; base?: string }) {
  return <main className={styles.home}><SkySocialTimeline agentManagementHref={mode === 'public' ? noahActionHref(mode, base, 'library') : undefined} postsOnly fullHome initialView="home" /></main>;
}
