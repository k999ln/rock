import { parseNoahConnect } from './noah-connect-requirements.ts';
import {
  noahListing,
  type NoahListingInput,
  NOAH_LISTING_SQL,
} from './noah-intake-listing.ts';
import { intakeStatement, type IntakeDb } from './noah-intake-db.ts';
import { NoahAgentError } from './noah-agent-upload.ts';

export type RemoteCandidate = {
  id: string;
  family_id: string;
  name: string;
  host: string;
  record_sha256: string;
  revision: number;
  source: NoahListingInput['source'];
  state: NoahListingInput['candidateState'];
  withdrawn_at: number | null;
  hidden_at: number | null;
  connect_json: string;
  connect_sha256: string;
  mouth: 'mcp-remote';
  setup: number;
  auth: NonNullable<NoahListingInput['check']>['auth'];
  result: string;
  level: 0 | 1 | 2;
  form_tools: number | null;
  one_tap_tools: number | null;
  tools_sha256: string | null;
  failures: number;
  first_failure_at: number | null;
  l1_at: number | null;
  l2_at: number | null;
  checked_at: number | null;
  next_check_at: number;
};
export const REMOTE_CANDIDATE_SQL = `SELECT c.id,c.family_id,c.name,c.host,c.record_sha256,c.revision,c.source,c.state,
 f.withdrawn_at,f.hidden_at,k.connect_json,k.connect_sha256,k.mouth,k.setup,k.auth,k.result,k.level,k.form_tools,
 k.one_tap_tools,k.tools_sha256,k.failures,k.first_failure_at,k.l1_at,k.l2_at,k.checked_at,k.next_check_at
 FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id=f.representative_id
 JOIN noah_intake_checks k ON k.candidate_id=c.id`;
export function candidateListing(row: RemoteCandidate) {
  return noahListing({
    source: row.source,
    familyId: row.family_id,
    candidateState: row.state,
    withdrawn: row.withdrawn_at !== null,
    hidden: row.hidden_at !== null,
    check: {
      mouth: row.mouth,
      setup: !!row.setup,
      auth: row.auth,
      result: row.result,
      level: row.level,
      formTools: row.form_tools,
      oneTapTools: row.one_tap_tools,
    },
  });
}
export async function remoteCandidate(db: IntakeDb, family: string) {
  return db
    .prepare(`${REMOTE_CANDIDATE_SQL} WHERE f.id=?`)
    .bind(family)
    .first<RemoteCandidate>();
}
export function candidateTarget(row: RemoteCandidate) {
  const req = parseNoahConnect(JSON.parse(row.connect_json));
  if (
    req.mouth !== 'mcp-remote' ||
    !('url' in req.target) ||
    req.secrets.length ||
    req.surface !== 'none' ||
    new URL(req.target.url).host !== row.host
  )
    throw new NoahAgentError('このAgentは、今はつなげません。', 422);
  return { req, url: req.target.url };
}
export async function touchRemoteFamily(
  db: IntakeDb,
  family: string,
  now: number,
) {
  const row = await remoteCandidate(db, family);
  if (!row) return;
  const listing = candidateListing(row);
  await intakeStatement(db, NOAH_LISTING_SQL.touch, {
    level: row.level,
    l2_at: row.l2_at,
    badge_hint: listing.listed
      ? row.level === 2
        ? 'one_click'
        : 'unverified'
      : 'blocked',
    listed: Number(listing.listed),
    one_tap: Number(listing.listed && listing.oneTap),
    now,
    candidate_id: row.id,
  }).run();
}
