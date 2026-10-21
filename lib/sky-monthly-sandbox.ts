import { citationInputSha256, completedCitationAgentJob, parseCitationAgentInput } from './sky-citation-agent.ts';
import { workStore } from './work-store.ts';
import { WorkError, workId } from './workflow.ts';

type DB = Pick<D1Database, 'prepare' | 'batch'>;
export const MONTHLY_SANDBOX_RATE = 'fixture-citations-10-jpy-per-1000chars-v1';
export type SandboxInvoice = { id: string; owner_id: string; period: string; status: 'draft' | 'issued' | 'paid'; total_minor: number; currency: string; cap_minor: number; provider_receipt: string | null };
type Quote = { id: string; owner_id: string; invoice_id: string; input_json: string; input_hash: string; amount_minor: number; quantity: number; rate_version: string; expires_at: number };
export type SandboxPaymentProof = { mode: 'sandbox'; invoiceId: string; ownerId: string; amountMinor: number; currency: string; status: 'paid'; receiptId: string };
export type SandboxPaymentProvider = { reconcile(invoice: SandboxInvoice): Promise<SandboxPaymentProof> };
/** Controlled local simulation, never a bank/Stripe receipt. Stable IDs permit replay. */
export const localMonthlyPaymentFixture: SandboxPaymentProvider = {
  async reconcile(invoice) {
    return { mode: 'sandbox', invoiceId: invoice.id, ownerId: invoice.owner_id, amountMinor: invoice.total_minor, currency: invoice.currency, status: 'paid', receiptId: `fixture:${invoice.id}` };
  },
};
const periodFor = (now: number) => new Date(now).toISOString().slice(0, 7);
export function skyMonthlySandbox(db: DB, now: () => number = Date.now) {
  async function invoice(owner: string, id: string) {
    const row = await db.prepare('SELECT * FROM sky_monthly_sandbox_invoices WHERE owner_id=? AND id=?').bind(owner, id).first<SandboxInvoice>();
    if (!row) throw new WorkError('請求が見つかりません。', 404);
    return row;
  }
  return {
    async list(owner: string) {
      const invoices = await db.prepare('SELECT * FROM sky_monthly_sandbox_invoices WHERE owner_id=? ORDER BY period DESC LIMIT 24').bind(owner).all<SandboxInvoice>();
      const usage = await db.prepare(`SELECT u.*,q.quantity,q.rate_version,json_extract(w.payload,'$.standaloneAgent.text') AS output FROM sky_monthly_sandbox_usage u
        JOIN sky_monthly_sandbox_quotes q ON q.id=u.quote_id LEFT JOIN work_jobs w ON w.id=u.job_id AND w.user_id=u.owner_id WHERE u.owner_id=? ORDER BY u.created_at DESC LIMIT 200`).bind(owner).all();
      return { invoices: invoices.results, usage: usage.results, mode: 'local-sandbox', realCharge: false };
    },
    async quote(owner: string, id: string, inputValue: unknown) {
      workId(id);
      const input = parseCitationAgentInput(inputValue);
      const hash = await citationInputSha256(input);
      const old = await db.prepare('SELECT * FROM sky_monthly_sandbox_quotes WHERE id=? AND owner_id=?').bind(id, owner).first<Quote>();
      if (old) {
        if (old.input_hash !== hash) throw new WorkError('同じIDの入力は変更できません。', 409);
        return old;
      }
      const at = now();
      const period = periodFor(at);
      await db.prepare(`INSERT INTO sky_monthly_sandbox_invoices(id,owner_id,period,created_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,period) DO NOTHING`).bind(crypto.randomUUID(), owner, period, at).run();
      const current = await db.prepare('SELECT * FROM sky_monthly_sandbox_invoices WHERE owner_id=? AND period=?').bind(owner, period).first<SandboxInvoice>();
      if (!current || current.status !== 'draft') throw new WorkError('この月は締め済みです。', 409);
      const quantity = Math.ceil(input.markdown.length / 1000);
      const amount = quantity * 10;
      if (current.total_minor + amount > current.cap_minor) throw new WorkError('テスト月上限1,000円を超えます。', 409);
      await db.prepare(`INSERT INTO sky_monthly_sandbox_quotes(id,owner_id,invoice_id,input_json,input_hash,rate_version,quantity,amount_minor,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id, owner, current.id, JSON.stringify(input), hash, MONTHLY_SANDBOX_RATE, quantity, amount, at + 300_000, at).run();
      const saved = await db.prepare('SELECT * FROM sky_monthly_sandbox_quotes WHERE id=? AND owner_id=?').bind(id, owner).first<Quote>();
      if (!saved || saved.input_hash !== hash) throw new WorkError('見積IDが使用されています。', 409);
      return saved;
    },
    async run(owner: string, id: string, approvedAmount: unknown, approvedRate: unknown) {
      const quote = await db.prepare('SELECT * FROM sky_monthly_sandbox_quotes WHERE id=? AND owner_id=?').bind(id, owner).first<Quote>();
      if (!quote) throw new WorkError('見積が見つかりません。', 404);
      if (approvedAmount !== quote.amount_minor || approvedRate !== quote.rate_version)
        throw new WorkError('表示された単価と金額を承認してください。', 409);
      const prior = await db.prepare('SELECT job_id FROM sky_monthly_sandbox_usage WHERE quote_id=? AND owner_id=?').bind(id, owner).first<{ job_id: string }>();
      if (prior) return { job: await workStore(db).get(owner, prior.job_id), replayed: true };
      const at = now();
      const bill = await invoice(owner, quote.invoice_id);
      if (quote.expires_at <= at || bill.period !== periodFor(at)) throw new WorkError('見積期限切れです。新しく見積もってください。', 409);
      const input = parseCitationAgentInput(JSON.parse(quote.input_json));
      const job = completedCitationAgentJob(id, input, quote.input_hash, new Date(at).toISOString());
      // Pure bounded computation above; persist the job and usage atomically. The trigger serializes cap/close races.
      try {
        await db.batch([
          db.prepare(`INSERT INTO sky_monthly_sandbox_usage(quote_id,owner_id,invoice_id,job_id,amount_minor,created_at)
            SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM sky_monthly_sandbox_usage WHERE quote_id=?)`).bind(id, owner, bill.id, id, quote.amount_minor, at, id),
          db.prepare(`INSERT INTO work_jobs(id,user_id,payload,revision,updated_at)
            SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM work_jobs WHERE id=? AND user_id=? AND json_extract(payload,'$.standaloneAgent.inputSha256')=?)`).bind(id, owner, JSON.stringify(job), job.revision, job.updatedAt, id, owner, quote.input_hash),
        ]);
      } catch { throw new WorkError('上限・締め状態・保存競合を確認してください。実課金はありません。', 409); }
      return { job: await workStore(db).get(owner, id), replayed: false };
    },
    async close(owner: string, id: string, simulateMonthEnd = false) {
      const row = await invoice(owner, id);
      if (!simulateMonthEnd && row.period >= periodFor(now())) throw new WorkError('月末前です。', 409);
      await db.prepare("UPDATE sky_monthly_sandbox_invoices SET status='issued' WHERE owner_id=? AND id=? AND status='draft'").bind(owner, id).run();
      return invoice(owner, id);
    },
    async reconcile(owner: string, id: string, provider: SandboxPaymentProvider) {
      const row = await invoice(owner, id);
      if (row.status === 'draft') throw new WorkError('先に月締めをしてください。', 409);
      if (row.status === 'paid') return row;
      const proof = await provider.reconcile(row);
      if (proof.mode !== 'sandbox' || proof.invoiceId !== row.id || proof.ownerId !== owner || proof.amountMinor !== row.total_minor || proof.currency !== row.currency || proof.status !== 'paid' || !/^fixture:[a-zA-Z0-9-]+$/.test(proof.receiptId))
        throw new WorkError('模擬収納の照合が一致しません。', 409);
      await db.prepare("UPDATE sky_monthly_sandbox_invoices SET status='paid',provider_receipt=? WHERE owner_id=? AND id=? AND status='issued'").bind(proof.receiptId, owner, id).run();
      return invoice(owner, id);
    },
  };
}
