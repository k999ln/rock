import {
  baseMarketAssets,
  EverythingMarketError,
  PAPER_MAX_EXPOSURE_MINOR,
  PAPER_MAX_ORDER_MINOR,
  PAPER_OPENING_BALANCE_MINOR,
  proposalDigest,
  type MarketAsset,
  type MarketProposalInput,
  type NewMarketAsset,
} from './everything-market.ts';

type AssetRow = {
  id: string;
  title: string;
  description: string;
  category: MarketAsset['category'];
  unit: string;
  reference_price_minor: number;
};

export type MarketProposal = MarketProposalInput & {
  id: string;
  digest: string;
  notionalMinor: number;
  status: 'PROPOSED' | 'APPROVED' | 'EXECUTED' | 'REJECTED';
  risk: {
    allowed: boolean;
    reasons: string[];
    maxOrderMinor: number;
    maxExposureMinor: number;
  };
  createdAt: string;
  updatedAt: string;
  receiptId?: string;
};

const proposalColumns = `p.id,p.asset_id AS assetId,p.side,p.price_minor AS priceMinor,p.quantity,p.mode,
  p.expires_at AS expiresAt,p.proposal_digest AS digest,p.notional_minor AS notionalMinor,p.status,
  p.risk_json AS riskJson,p.created_at AS createdAt,p.updated_at AS updatedAt,r.receipt_id AS receiptId`;

function strictId(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value)
  )
    throw new EverythingMarketError('invalid_id', `${label}を確認してください。`);
  return value;
}

function mapProposal(row: Record<string, unknown>): MarketProposal {
  const { riskJson, ...proposal } = row;
  return {
    ...proposal,
    risk: JSON.parse(String(riskJson)),
  } as MarketProposal;
}

export function everythingMarketStore(db: D1Database, user: string) {
  if (!user)
    throw new EverythingMarketError(
      'unauthorized',
      'サインインしてください。',
      401,
    );

  async function userAssets(): Promise<MarketAsset[]> {
    const rows = await db
      .prepare(
        `SELECT id,title,description,category,unit,reference_price_minor
         FROM marketplace_assets WHERE status='open'
         ORDER BY created_at DESC LIMIT 100`,
      )
      .all<AssetRow>();
    return rows.results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      unit: row.unit,
      bidMinor: Math.max(1, Math.floor(row.reference_price_minor * 0.96)),
      askMinor: Math.ceil(row.reference_price_minor * 1.04),
      volume: 0,
      changeBps: 0,
      source: 'user',
      status: 'open',
    }));
  }

  async function listProposals(): Promise<MarketProposal[]> {
    const rows = await db
      .prepare(
        `SELECT ${proposalColumns}
         FROM marketplace_proposals p
         LEFT JOIN marketplace_receipts r ON r.proposal_id=p.id
         WHERE p.user_id=? ORDER BY p.updated_at DESC,p.id DESC LIMIT 100`,
      )
      .bind(user)
      .all<Record<string, unknown>>();
    return rows.results.map(mapProposal);
  }

  async function snapshot() {
    const [customAssets, proposals, exposure] = await Promise.all([
      userAssets(),
      listProposals(),
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN side='buy' THEN notional_minor ELSE -notional_minor END),0) AS total FROM marketplace_positions WHERE user_id=? AND status='OPEN'",
        )
        .bind(user)
        .first<{ total: number }>(),
    ]);
    const exposedMinor = exposure?.total ?? 0;
    return {
      schema: 'rockstar-market-state/1',
      mode: 'PAPER' as const,
      liveEnabled: false,
      assets: [...baseMarketAssets, ...customAssets],
      proposals,
      paperBalanceMinor: Math.max(
        0,
        PAPER_OPENING_BALANCE_MINOR - exposedMinor,
      ),
      exposedMinor,
      limits: {
        maxOrderMinor: PAPER_MAX_ORDER_MINOR,
        maxExposureMinor: PAPER_MAX_EXPOSURE_MINOR,
      },
    };
  }

  async function createAsset(input: NewMarketAsset) {
    const assetId = `asset:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO marketplace_assets(
          id,user_id,title,description,category,unit,reference_price_minor,status,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,'open',?,?)`,
      )
      .bind(
        assetId,
        user,
        input.title,
        input.description,
        input.category,
        input.unit,
        input.referencePriceMinor,
        now,
        now,
      )
      .run();
    return snapshot();
  }

  async function propose(
    input: MarketProposalInput,
    idempotencyKey: string,
  ) {
    const key = strictId(idempotencyKey, '操作ID');
    const replay = await db
      .prepare(
        `SELECT ${proposalColumns}
         FROM marketplace_proposals p
         LEFT JOIN marketplace_receipts r ON r.proposal_id=p.id
         WHERE p.user_id=? AND p.idempotency_key=?`,
      )
      .bind(user, key)
      .first<Record<string, unknown>>();
    if (replay) {
      const prior = mapProposal(replay);
      if (
        prior.assetId !== input.assetId ||
        prior.side !== input.side ||
        prior.priceMinor !== input.priceMinor ||
        prior.quantity !== input.quantity ||
        prior.mode !== input.mode ||
        prior.expiresAt !== input.expiresAt
      )
        throw new EverythingMarketError(
          'idempotency_conflict',
          '同じ操作IDで異なる提案は保存できません。',
          409,
        );
      return prior;
    }

    const known =
      baseMarketAssets.some((asset) => asset.id === input.assetId) ||
      Boolean(
        await db
          .prepare(
            "SELECT 1 AS ok FROM marketplace_assets WHERE id=? AND status='open'",
          )
          .bind(input.assetId)
          .first(),
      );
    if (!known)
      throw new EverythingMarketError(
        'asset_unavailable',
        '取引対象が見つかりません。',
        404,
      );

    const [exposure, inventory] = await Promise.all([
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN side='buy' THEN notional_minor ELSE -notional_minor END),0) AS total FROM marketplace_positions WHERE user_id=? AND status='OPEN'",
        )
        .bind(user)
        .first<{ total: number }>(),
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN side='buy' THEN quantity ELSE -quantity END),0) AS total FROM marketplace_positions WHERE user_id=? AND asset_id=? AND status='OPEN'",
        )
        .bind(user, input.assetId)
        .first<{ total: number }>(),
    ]);
    const notionalMinor = input.priceMinor * input.quantity;
    const reasons: string[] = [];
    if (notionalMinor > PAPER_MAX_ORDER_MINOR) reasons.push('ORDER_LIMIT');
    const projectedExposure =
      (exposure?.total ?? 0) +
      (input.side === 'buy' ? notionalMinor : -notionalMinor);
    if (projectedExposure > PAPER_MAX_EXPOSURE_MINOR)
      reasons.push('EXPOSURE_LIMIT');
    if (input.side === 'sell' && (inventory?.total ?? 0) < input.quantity)
      reasons.push('INSUFFICIENT_POSITION');
    const risk = {
      allowed: reasons.length === 0,
      reasons,
      maxOrderMinor: PAPER_MAX_ORDER_MINOR,
      maxExposureMinor: PAPER_MAX_EXPOSURE_MINOR,
    };
    const proposalId = `proposal:${crypto.randomUUID()}`;
    const binding = {
      proposalId,
      ownerId: user,
      ...input,
      notionalMinor,
      risk,
    };
    const digest = await proposalDigest(binding);
    const now = new Date().toISOString();
    const status = risk.allowed ? 'PROPOSED' : 'REJECTED';
    await db.batch([
      db
        .prepare(
          `INSERT INTO marketplace_proposals(
            id,user_id,asset_id,side,price_minor,quantity,mode,expires_at,notional_minor,
            request_json,proposal_digest,risk_json,status,idempotency_key,created_at,updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          proposalId,
          user,
          input.assetId,
          input.side,
          input.priceMinor,
          input.quantity,
          input.mode,
          input.expiresAt,
          notionalMinor,
          JSON.stringify(binding),
          digest,
          JSON.stringify(risk),
          status,
          key,
          now,
          now,
        ),
      db
        .prepare(
          'INSERT INTO marketplace_events(id,user_id,name,subject_id,payload,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          `event:${crypto.randomUUID()}`,
          user,
          risk.allowed ? 'spend.proposed' : 'spend.rejected',
          proposalId,
          JSON.stringify({ proposalId, digest, risk }),
          now,
        ),
    ]);
    return (await listProposals()).find(
      (proposal) => proposal.id === proposalId,
    )!;
  }

  async function approve(proposalIdValue: unknown, digestValue: unknown) {
    const proposalId = strictId(proposalIdValue, '提案ID');
    const digest = strictId(digestValue, 'ダイジェスト');
    const row = await db
      .prepare(
        'SELECT proposal_digest,status,expires_at FROM marketplace_proposals WHERE id=? AND user_id=?',
      )
      .bind(proposalId, user)
      .first<{
        proposal_digest: string;
        status: string;
        expires_at: string;
      }>();
    if (
      !row ||
      row.status !== 'PROPOSED' ||
      row.proposal_digest !== digest
    )
      throw new EverythingMarketError(
        'proposal_conflict',
        '同一内容の有効な提案を承認してください。',
        409,
      );
    if (Date.parse(row.expires_at) <= Date.now())
      throw new EverythingMarketError(
        'proposal_expired',
        '提案の有効期限が切れました。',
        409,
      );
    const now = new Date().toISOString();
    const result = await db.batch([
      db
        .prepare(
          "INSERT INTO marketplace_approvals(id,proposal_id,user_id,proposal_digest,decision,created_at) VALUES(?,?,?,?, 'APPROVED',?)",
        )
        .bind(
          `approval:${crypto.randomUUID()}`,
          proposalId,
          user,
          digest,
          now,
        ),
      db
        .prepare(
          "UPDATE marketplace_proposals SET status='APPROVED',updated_at=? WHERE id=? AND user_id=? AND status='PROPOSED' AND proposal_digest=?",
        )
        .bind(now, proposalId, user, digest),
      db
        .prepare(
          'INSERT INTO marketplace_events(id,user_id,name,subject_id,payload,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          `event:${crypto.randomUUID()}`,
          user,
          'spend.approved',
          proposalId,
          JSON.stringify({ proposalId, digest }),
          now,
        ),
    ]);
    if (!result[1].meta.changes)
      throw new EverythingMarketError(
        'proposal_conflict',
        '提案の状態が変わりました。',
        409,
      );
    return (await listProposals()).find(
      (proposal) => proposal.id === proposalId,
    )!;
  }

  async function execute(
    proposalIdValue: unknown,
    idempotencyKey: unknown,
  ) {
    const proposalId = strictId(proposalIdValue, '提案ID');
    const key = strictId(idempotencyKey, '実行ID');
    const replay = await db
      .prepare(
        `SELECT ${proposalColumns}
         FROM marketplace_proposals p
         LEFT JOIN marketplace_receipts r ON r.proposal_id=p.id
         WHERE p.user_id=? AND r.execution_key=?`,
      )
      .bind(user, key)
      .first<Record<string, unknown>>();
    if (replay) {
      const prior = mapProposal(replay);
      if (prior.id !== proposalId)
        throw new EverythingMarketError(
          'idempotency_conflict',
          '同じ実行IDを別の提案には使えません。',
          409,
        );
      return prior;
    }
    const row = await db
      .prepare(
        'SELECT * FROM marketplace_proposals WHERE id=? AND user_id=?',
      )
      .bind(proposalId, user)
      .first<Record<string, unknown>>();
    if (!row || row.status !== 'APPROVED')
      throw new EverythingMarketError(
        'approval_required',
        '承認済みの提案だけを実行できます。',
        409,
      );
    if (Date.parse(String(row.expires_at)) <= Date.now())
      throw new EverythingMarketError(
        'proposal_expired',
        '提案の有効期限が切れました。',
        409,
      );

    const [exposure, inventory] = await Promise.all([
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN side='buy' THEN notional_minor ELSE -notional_minor END),0) AS total FROM marketplace_positions WHERE user_id=? AND status='OPEN'",
        )
        .bind(user)
        .first<{ total: number }>(),
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN side='buy' THEN quantity ELSE -quantity END),0) AS total FROM marketplace_positions WHERE user_id=? AND asset_id=? AND status='OPEN'",
        )
        .bind(user, row.asset_id)
        .first<{ total: number }>(),
    ]);
    const projectedExposure =
      (exposure?.total ?? 0) +
      (row.side === 'buy'
        ? Number(row.notional_minor)
        : -Number(row.notional_minor));
    const recheckReasons: string[] = [];
    if (projectedExposure > PAPER_MAX_EXPOSURE_MINOR)
      recheckReasons.push('EXPOSURE_LIMIT');
    if (
      row.side === 'sell' &&
      (inventory?.total ?? 0) < Number(row.quantity)
    )
      recheckReasons.push('INSUFFICIENT_POSITION');
    if (recheckReasons.length) {
      const rejectedAt = new Date().toISOString();
      await db.batch([
        db
          .prepare(
            "UPDATE marketplace_proposals SET status='REJECTED',updated_at=? WHERE id=? AND user_id=? AND status='APPROVED'",
          )
          .bind(rejectedAt, proposalId, user),
        db
          .prepare(
            'INSERT INTO marketplace_events(id,user_id,name,subject_id,payload,created_at) VALUES(?,?,?,?,?,?)',
          )
          .bind(
            `event:${crypto.randomUUID()}`,
            user,
            'risk.rejected',
            proposalId,
            JSON.stringify({ proposalId, reasons: recheckReasons }),
            rejectedAt,
          ),
      ]);
      return (await listProposals()).find(
        (proposal) => proposal.id === proposalId,
      )!;
    }

    const receiptId = `paper:${crypto.randomUUID()}`;
    const positionId = `position:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const receipt = {
      schema: 'rockstar-market-execution-receipt/1',
      receiptId,
      proposalId,
      adapterId: 'rockstar.paper',
      mode: 'PAPER',
      state: 'EXECUTED',
      financialTransaction: false,
      simulationOnly: true,
      externalOrderId: null,
      principalMinor: Number(row.notional_minor),
    };
    const results = await db.batch([
      db
        .prepare(
          "UPDATE marketplace_proposals SET status='EXECUTED',updated_at=? WHERE id=? AND user_id=? AND status='APPROVED'",
        )
        .bind(now, proposalId, user),
      db
        .prepare(
          "INSERT INTO marketplace_reservations(proposal_id,user_id,held_minor,state,created_at,updated_at) VALUES(?,?,?,'COMMITTED',?,?)",
        )
        .bind(proposalId, user, row.notional_minor, now, now),
      db
        .prepare(
          'INSERT INTO marketplace_receipts(proposal_id,receipt_id,user_id,execution_key,receipt_json,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          proposalId,
          receiptId,
          user,
          key,
          JSON.stringify(receipt),
          now,
        ),
      db
        .prepare(
          "INSERT INTO marketplace_positions(id,proposal_id,user_id,asset_id,side,quantity,entry_price_minor,notional_minor,status,created_at) VALUES(?,?,?,?,?,?,?,?,'OPEN',?)",
        )
        .bind(
          positionId,
          proposalId,
          user,
          row.asset_id,
          row.side,
          row.quantity,
          row.price_minor,
          row.notional_minor,
          now,
        ),
      db
        .prepare(
          'INSERT INTO marketplace_events(id,user_id,name,subject_id,payload,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          `event:${crypto.randomUUID()}`,
          user,
          'trade.executed',
          proposalId,
          JSON.stringify(receipt),
          now,
        ),
    ]);
    if (!results[0].meta.changes)
      throw new EverythingMarketError(
        'proposal_conflict',
        '提案の状態が変わりました。',
        409,
      );
    return (await listProposals()).find(
      (proposal) => proposal.id === proposalId,
    )!;
  }

  return { snapshot, createAsset, propose, approve, execute };
}
