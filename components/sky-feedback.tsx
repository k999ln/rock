import { skyError, skyProgress } from '@/lib/sky-presentation';
import type { WorkJob } from '@/lib/workflow';

export function SkyNotice({ message, className }: { message: unknown; className?: string }) {
  const notice = skyError(message);
  return <div className={className} role="alert"><p>{notice.message}</p>{notice.next && <p>{notice.next}</p>}
    {notice.reference && <details><summary>問い合わせ用の記録</summary><p>確認用の番号: <code>{notice.reference}</code></p></details>}
  </div>;
}

export function SkyWorkProgress({ job }: { job: WorkJob }) {
  const state = skyProgress(job.status);
  return <section aria-label="仕事の進み具合" aria-live="polite"><h3>{state.label}</h3><p>{state.detail}</p><p>{state.next}</p>
    <details><summary>仕事の詳しい記録</summary><p>仕事の番号: {job.id} / 更新番号: {job.revision}</p></details>
  </section>;
}
