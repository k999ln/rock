import { OWNER_CHANGED } from './owner-intent.ts';

/** Both values come from readOwnerScope; an unknown current owner never matches. */
export function pendingOwnerStatus(expected: string, current: string | null): 'unknown' | 'changed' | 'matching' {
  if (!current) return 'unknown';
  return current === expected ? 'matching' : 'changed';
}

/** Authentication/owner loss and uncertain responses preserve the original operation. */
export function isDefinitivePendingSaveFailure(status: number, code?: string): boolean {
  return code !== OWNER_CHANGED && [400, 404, 409, 413, 415].includes(status);
}
