import type { TeamCase } from './coconala-team';
import { ownerRevisionJsonStore } from './owner-revision-json-store.ts';

export function coconalaTeamStore(db: Pick<D1Database, 'prepare'>) {
  return ownerRevisionJsonStore<TeamCase>(db, 'coconala_team_cases');
}
