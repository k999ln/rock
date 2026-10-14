import type { CampusId } from './campus.ts';

const CAMPUS_HOSTS: Readonly<Record<string, CampusId>> = {
  'columbia.avoado.si': 'columbia',
};

export function campusForHost(value: string | null | undefined): CampusId | null {
  const firstHost = value?.split(',', 1)[0]?.trim().toLowerCase() ?? '';
  const hostname = firstHost.replace(/:\d+$/u, '').replace(/\.$/u, '');
  return CAMPUS_HOSTS[hostname] ?? null;
}
