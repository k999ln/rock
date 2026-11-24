import { eveCombinationFile } from './eve-combination-catalog.ts';
import type { EveAuthor, EveCombination } from './eve-combination.ts';
import type { NoahAskItem } from './noah-ask-view.ts';
import type { WorkJob } from './workflow.ts';

export type RevenueStage = 'approved' | 'paid' | 'cost';
export type NoahRevenueOperation = {
  schema: 'noah-work-revenue/1';
  combinationId: string;
  version: number;
  author: EveAuthor;
  authorRelation: 'self' | 'other' | 'unknown';
  issuer?: string;
  target?: { familyKey: string; endpoint: string; tool: string };
  receipts: {
    stage: RevenueStage;
    source: string;
    amountYen: number;
    reference: string;
    evidenceSha256: string;
    observedAt: number;
  }[];
};
export type NoahRevenueTarget = {
  familyKey: string;
  endpoint: string;
  tool: string;
  combinationId: string;
};
export type NoahRevenueConfig = {
  providerId?: string;
  secret?: string;
  target?: NoahRevenueTarget;
  authorOwners: Record<string, string>;
  operatorAccounts: Record<string, string>;
};
function stringMap(raw?: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((v) => typeof v === 'string' && v.length > 0)
    )
      return Object.assign(Object.create(null), parsed);
  } catch {
    /* A bad binding cannot enable an issuer. */
  }
  return Object.create(null) as Record<string, string>;
}

export function noahRevenueConfig(
  env: Record<string, string | undefined>,
): NoahRevenueConfig {
  const raw = stringMap(env.NOAH_REVENUE_PROVIDER_TARGET);
  let target: NoahRevenueTarget | undefined;
  try {
    const endpoint = new URL(raw.endpoint);
    // The public training/consultation flow belongs to the applicant, not the earning operator.
    if (
      raw.familyKey &&
      raw.tool &&
      eveCombinationFile(raw.combinationId) &&
      endpoint.protocol === 'https:' &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      !/\/consult(?:\/|$)/i.test(endpoint.pathname) &&
      !/noah-business-training/i.test(raw.familyKey + ' ' + endpoint.hostname)
    )
      target = {
        familyKey: raw.familyKey,
        endpoint: endpoint.href,
        tool: raw.tool,
        combinationId: raw.combinationId,
      };
  } catch {
    /* no trusted remote target */
  }
  // One provider operator account may belong to only one Noah owner.
  const operatorAccounts = stringMap(env.NOAH_REVENUE_OPERATOR_ACCOUNTS);
  const owners = new Map<string, number>();
  for (const account of Object.values(operatorAccounts))
    owners.set(account, (owners.get(account) ?? 0) + 1);
  for (const [owner, account] of Object.entries(operatorAccounts))
    if (owners.get(account) !== 1) delete operatorAccounts[owner];
  // The work-level signing key is opt-in. A credential for another settlement API grants no access here.
  return {
    providerId: env.NOAH_REVENUE_PROVIDER_ID,
    secret: env.NOAH_REVENUE_PROVIDER_SECRET,
    target,
    authorOwners: stringMap(env.NOAH_REVENUE_AUTHOR_OWNERS),
    operatorAccounts,
  };
}
export function revenueAuthorRelation(
  author: EveAuthor,
  owner: string,
  config?: NoahRevenueConfig,
): NoahRevenueOperation['authorRelation'] {
  if (author.kind === 'eve') return 'other';
  const authorOwner = config?.authorOwners[author.id];
  if (!authorOwner) return 'unknown';
  return authorOwner === owner ? 'self' : 'other';
}
export function initialNoahRevenue(
  c: EveCombination,
  owner: string,
  config?: NoahRevenueConfig,
): NoahRevenueOperation {
  return {
    schema: 'noah-work-revenue/1',
    combinationId: c.id,
    version: c.version,
    author: c.author,
    authorRelation: revenueAuthorRelation(c.author, owner, config),
    receipts: [],
  };
}
function matchesTarget(
  job: WorkJob,
  config: NoahRevenueConfig | undefined,
  endpoint: string,
  tool: string,
) {
  const r = job.noahRemote,
    t = config?.target;
  if (
    !r ||
    !t ||
    !config?.providerId ||
    !config.secret ||
    config.secret.length < 32 ||
    job.templateId !== 'noah-agent-remote' ||
    r.familyKey !== t.familyKey ||
    r.tool !== tool ||
    t.tool !== tool ||
    r.cloud
  )
    return false;
  try {
    return (
      new URL(endpoint).href === t.endpoint &&
      (!r.provider ||
        (r.provider.projectId === t.familyKey &&
          r.provider.api === tool &&
          new URL(r.provider.origin).href === t.endpoint))
    );
  } catch {
    return false;
  }
}
/** Call only with the endpoint and tool pinned by the server at Work creation. */
export function bindRevenueExecution(
  job: WorkJob,
  owner: string,
  config: NoahRevenueConfig | undefined,
  endpoint: string,
  tool: string,
): WorkJob {
  if (!matchesTarget(job, config, endpoint, tool) || !config?.target)
    return job;
  const t = config.target,
    c = eveCombinationFile(t.combinationId);
  if (!c) return job;
  job.noahRevenue = {
    ...initialNoahRevenue(c, owner, config),
    issuer: config.providerId,
    target: { familyKey: t.familyKey, endpoint: t.endpoint, tool: t.tool },
  };
  return job;
}
function matchedRevenueMeta(
  job: WorkJob,
  config: NoahRevenueConfig | undefined,
  endpoint: string,
  tool: string,
) {
  const op = job.noahRevenue;
  if (
    !op?.target ||
    op.issuer !== config?.providerId ||
    op.combinationId !== config?.target?.combinationId ||
    op.target.familyKey !== config?.target?.familyKey ||
    op.target.endpoint !== config?.target?.endpoint ||
    op.target.tool !== tool ||
    !matchesTarget(job, config, endpoint, tool)
  )
    return undefined;
  return {
    workId: job.id,
    combinationId: op.combinationId,
    version: op.version,
  };
}
export function isNoahRevenueOperation(
  job?: WorkJob | null,
): job is WorkJob & { noahRevenue: NoahRevenueOperation } {
  return (
    job?.templateId === 'noah-revenue-operation' &&
    job.noahRevenue?.schema === 'noah-work-revenue/1'
  );
}
export function noahRevenueOperationWorkView(
  job: WorkJob,
  detail = false,
): NoahAskItem {
  if (!isNoahRevenueOperation(job)) throw new Error('Invalid revenue work');
  const at = Date.parse(job.createdAt);
  return {
    id: job.id,
    connectionId: job.id,
    workId: job.id,
    agentId: job.noahRevenue.combinationId,
    state: 'succeeded',
    mode: 'revenue',
    tool: job.title,
    revision: job.revision,
    host: null,
    stopRequested: false,
    createdAt: at,
    updatedAt: Date.parse(job.updatedAt),
    finishedAt: at,
    ...(detail
      ? {
          result: {
            text: 'この仕事に届いた収益の記録を下で確認できます。',
            attachments: 0,
            truncated: false,
          },
        }
      : {}),
  };
}

const encoder = new TextEncoder();
export async function revenueDispatchMeta(
  job: WorkJob,
  config: NoahRevenueConfig | undefined,
  endpoint: string,
  tool: string,
) {
  const meta = matchedRevenueMeta(job, config, endpoint, tool);
  if (!meta || !config?.secret) return undefined;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = [
    'noah-revenue-dispatch/1',
    config.providerId,
    job.id,
    meta.combinationId,
    meta.version,
    job.noahRemote?.familyKey,
    endpoint,
    tool,
  ];
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(JSON.stringify(data)),
  );
  return {
    ...meta,
    dispatchProof: Array.from(new Uint8Array(signature), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join(''),
  };
}
// Only the digest is saved. A provider must return the exact proof it received on the successful call.
export async function revenueDispatchHash(proof: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(proof));
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}
export function storedRevenueDispatch(job: WorkJob): string | undefined {
  const op = job.noahRevenue,
    run = job.noahRemote;
  if (
    job.templateId !== 'noah-agent-remote' ||
    !op?.issuer ||
    !op.target ||
    !run ||
    run.cloud ||
    run.state !== 'returned' ||
    run.familyKey !== op.target.familyKey ||
    run.tool !== op.target.tool ||
    !run.used.includes(op.target.tool) ||
    !run.revenueDispatchSha256 ||
    !/^[a-f0-9]{64}$/.test(run.revenueDispatchSha256)
  )
    return undefined;
  if (run.provider) {
    const provider = run.provider;
    if (
      provider.projectId !== op.target.familyKey ||
      provider.api !== op.target.tool
    )
      return undefined;
    try {
      if (new URL(provider.origin).href !== op.target.endpoint)
        return undefined;
    } catch {
      return undefined;
    }
  }
  return run.revenueDispatchSha256;
}
export function noahRevenueReadContext(
  job: WorkJob,
  owner: string,
  config?: NoahRevenueConfig,
) {
  const op = job.noahRevenue;
  if (!op) return undefined;
  const relation =
    op.authorRelation === 'unknown'
      ? revenueAuthorRelation(op.author, owner, config)
      : op.authorRelation;
  const issuer =
    !!config?.operatorAccounts[owner] &&
    !!config.providerId &&
    !!config.secret &&
    config.secret.length >= 32 &&
    (!op.issuer || op.issuer === config.providerId);
  const channel = isNoahRevenueOperation(job) || !!storedRevenueDispatch(job);
  return {
    operation:
      relation === op.authorRelation ? op : { ...op, authorRelation: relation },
    receivingConfigured: issuer && channel,
  };
}
