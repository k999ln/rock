import type { DirectoryEntry } from './noah-agent-directory.ts';
import { noahProjectHref } from './noah-project-view.ts';
import { noahRevenueTarget } from './noah-revenue-directory.ts';

const choices = [
  {
    id: 'wordpress-maintenance',
    title: 'WordPressの保守を相談する準備',
    input: '管理しているWordPressサイトの公開URL',
    output: '公開ページの診断結果と、保守の相談で確認したいこと',
    operation: 'diagnose_wordpress_site',
  },
  {
    id: 'ec-production',
    title: 'ネットショップの改修点を調べる',
    input: '管理しているネットショップの公開URL',
    output: '公開ページの診断結果と、制作・改修を依頼するときの確認事項',
    operation: 'diagnose_ec_site',
  },
  {
    id: 'memory',
    title: 'メモの中の関係を整理する',
    input: '人物・担当・作業など、整理したいメモ',
    output: 'メモに出てくる項目と関係を整理した記録',
  },
] as const;

export type NoahFirstJob = {
  id: typeof choices[number]['id'];
  title: string;
  input: string;
  output: string;
  operation?: 'diagnose_wordpress_site' | 'diagnose_ec_site';
  href: string | null;
};

/** The directory is ordered the same way the project and execution routes resolve IDs. */
export async function noahFirstJobs(entries: readonly DirectoryEntry[], publicAsk: boolean, now = Date.now()): Promise<NoahFirstJob[]> {
  const destinations = new Map<NoahFirstJob['id'], string>();
  const seen = new Set<string>();
  for (const entry of entries) {
    const projectId = entry.card.feedbackId ?? entry.card.id;
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    if (!/^project-[a-f0-9]{64}$/.test(projectId)) continue;
    let id: NoahFirstJob['id'];
    if (entry.cloudProfile === 'memory') {
      id = 'memory';
    } else if (publicAsk && (entry.firstParty === 'wordpress-maintenance' || entry.firstParty === 'ec-production')) {
      if (!await noahRevenueTarget(entry, now)) continue;
      id = entry.firstParty;
    } else continue;
    if (!destinations.has(id)) destinations.set(id, `${noahProjectHref(projectId)}&firstJob=${id}`);
  }
  return choices.map(choice => ({ ...choice, href: destinations.get(choice.id) ?? null }));
}
