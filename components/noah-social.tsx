'use client';
import NoahLoading from './noah-loading';
import { useNoahLocale } from './noah-locale';
import SkySocialTimeline from './sky-social-timeline';
import { noahActionHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-shell.module.css';
export default function NoahSocial({ mode = 'local', base = '/noah' }: { mode?: NoahSurfaceMode; base?: string }) {
  const {t}=useNoahLocale();
  return <main className={styles.home}><SkySocialTimeline translate={t} loadingIndicator={<NoahLoading/>} accountHref="/noah/account?returnTo=%2Fnoah%2Fsocial" agentManagementHref={mode === 'public' ? noahActionHref(mode, base, 'library') : undefined} postsOnly fullHome initialView="home" /></main>;
}
