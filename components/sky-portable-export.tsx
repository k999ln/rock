'use client';
import { useEffect, useRef, useState } from 'react';
import type { WorkJob } from '@/lib/workflow';
import { SkyNotice } from '@/components/sky-feedback';
import styles from './sky-add-zoom-prototype.module.css';

export function SkyPortableExport({ job }: { job: WorkJob }) {
  const [file, setFile] = useState<{ url: string; filename: string } | null>(null);
  const [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const current = useRef<{ active: boolean; url: string | null }>({ active: true, url: null });
  useEffect(() => { const state = current.current; state.active = true; return () => {
    state.active = false; if (state.url) URL.revokeObjectURL(state.url);
  }; }, []);
  async function prepare() {
    if (preparing || file) return;
    setPreparing(true); setError('');
    try {
      const { buildSkyOwnerExport } = await import('@/lib/sky-owner-export');
      const exported = await buildSkyOwnerExport({ job, agents: [], cloud: [], budget: null, reservations: [] });
      if (!current.current.active) return;
      const url = URL.createObjectURL(new Blob([exported.html], { type: 'text/html;charset=utf-8' }));
      current.current.url = url; setFile({ url, filename: job.skyApp && job.skyApp.request.appId !== 'planner' ? '会議のまとめ.html' : 'Skyの成果.html' });
    } catch { if (current.current.active) setError('HTMLを用意できませんでした。元の成果を保持して再試行してください。'); }
    finally { if (current.current.active) setPreparing(false); }
  }
  return <div className={styles.devicePath}>
    <p>成果をファイルに保存すると、Skyを終了しても読めます。元の資料や仕事の記録も含むため、保存先と共有する相手を自分で選んでください。</p>
    <button disabled={preparing || !!file} onClick={() => void prepare()}>{preparing ? '保存するファイルを準備中…' : 'Skyなしで読めるファイルを用意'}</button>
    {file && <p><a href={file.url} download={file.filename}>ファイルを保存</a></p>}
    {error && <SkyNotice message={error} />}
  </div>;
}
