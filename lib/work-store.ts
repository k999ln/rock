import type { WorkJob } from './workflow';
import { ownerRevisionJsonStore } from './owner-revision-json-store.ts';

export function workStore(db: Pick<D1Database, 'prepare'>) {
  return ownerRevisionJsonStore<WorkJob>(db, 'work_jobs');
}
