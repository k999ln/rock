'use client';
import SkySocialTimeline from './sky-social-timeline';
import { useNoahHash } from './use-noah-hash';
import { noahActionHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-shell.module.css';
export default function NoahSocial({ mode = 'local', base = '/noah' }: { mode?: NoahSurfaceMode; base?: string }) {
  const hash = useNoahHash();
  return <main className={styles.home}><SkySocialTimeline agentManagementHref={mode === 'public' ? noahActionHref(mode, base, 'library') : undefined} key={hash === '#communities' ? 'communities' : 'posts'} fullHome initialView={hash === '#communities' ? 'communities' : 'home'} /></main>;
}
