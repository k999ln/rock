import { noahAgentConnectionExplanation, noahAgentExplanation } from './noah-agent-explanation.ts';
import { readCurrentNoahAgentLabels } from './noah-agent-labels.ts';
import { planNoahSubject, readNoahSubject } from './noah-connect-source.ts';
import type { IntakeDb } from './noah-intake-db.ts';

export async function readNoahAgentExplanation(db: IntakeDb, { id, owner, reviewer }: {
  id: string; owner: string | null; reviewer: boolean;
}, display?: { labels: boolean; connectionFallback: boolean }) {
  const subject = await readNoahSubject(db, id);
  if (!subject?.target || subject.level < 1) return null;
  // The existing detail API authorizes the viewer first. Reviewers may inspect a
  // credential-gated handshake; withdrawn or unverified definitions stay hidden.
  if (!subject.listing.listed && !(reviewer && ['needs_key', 'needs_permission'].includes(subject.listing.reason))) return null;
  const current = await db.prepare(`SELECT k.tools_sha256 AS toolsSha256, k.tool_count AS toolCount, c.summary_ja AS summaryJa
    FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id=f.representative_id
    JOIN noah_intake_checks k ON k.candidate_id=c.id
    WHERE f.id=? AND c.id=? AND c.record_sha256=? AND k.connect_sha256=? AND k.level>=1
      AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL AND c.state='active'`)
    .bind(id, subject.candidateId, subject.digest, subject.target.connectSha256)
    .first<{ toolsSha256: string | null; toolCount: number | null; summaryJa: string | null }>();
  if (!current) return null;
  const labels = display?.labels !== false && current.toolsSha256
    ? await readCurrentNoahAgentLabels(db, { familyId: id, candidateId: subject.candidateId, toolsSha256: current.toolsSha256 }).catch(() => null)
    : null;
  const fullyLabelled = labels?.status === 'ready' && labels.tools.length === current.toolCount;
  if (!fullyLabelled && !display?.connectionFallback) return null;
  const { plan } = await planNoahSubject({ db }, owner, { ...subject, target: subject.target });
  const detailed = fullyLabelled && plan.badge !== 'blocked'
    ? noahAgentExplanation(labels.tools.map(({ toolName, ...label }) => ({ ...label, name: toolName })), plan.steps)
    : null;
  const explanation = detailed ?? (display?.connectionFallback ? noahAgentConnectionExplanation(plan.steps, plan.badge === 'blocked') : null);
  return explanation ? { explanation, summaryJa: current.summaryJa } : null;
}
