import {
  businessToday,
  emptyBusinessLedger,
  applyBusinessCommand,
  businessReport,
  campaignDraft,
  validateBusinessConfig,
} from './business-core.mjs';
import { emptyBusinessAgent, runBusinessAgent } from './business-runner.mjs';
import { applySourceObservation, sourceStatus } from './business-sources.mjs';
const response = (body, status = 200) => Response.json(body, { status });
// A single provider-owned Durable Object, never an object chosen by a public input.
export class BusinessLedger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  async alarm() {
    await this.ctx.storage.transaction(async (tx) => {
      const agent = (await tx.get('agent')) || emptyBusinessAgent();
      if (!agent.enabled) {
        await tx.deleteAlarm();
        return;
      }
      try {
        const config = validateBusinessConfig(
          JSON.parse(this.env.BUSINESS_CONFIG_JSON),
        );
        const result = runBusinessAgent(
          agent,
          (await tx.get('ledger')) || emptyBusinessLedger(),
          config,
          {
            origin: 'https://noah-business-si.mr-kirin999.workers.dev',
            sources: (await tx.get('sources')) || {},
          },
        );
        if (result.ran) {
          await tx.put('agent', result.agent);
          await tx.put('ledger', result.ledger);
        }
        await tx.setAlarm(result.agent.nextRunAt);
      } catch {
        agent.stages = [
          {
            id: 'configuration',
            state: 'needs_attention',
            detail:
              '設定または台帳の検証に失敗。成功に昇格せず次回に再確認します。',
          },
        ];
        agent.nextRunAt = Date.now() + 15 * 60 * 1000;
        await tx.put('agent', agent);
        await tx.setAlarm(agent.nextRunAt);
      }
    });
  }
  async fetch(request) {
    try {
      const v = await request.json();
      return await this.ctx.storage.transaction(async (tx) => {
        const state = (await tx.get('ledger')) || emptyBusinessLedger();
        if (v.kind === 'source_observation') {
          const result = applySourceObservation(
            state,
            (await tx.get('sources')) || {},
            v.observation,
            v.config,
          );
          if (!result.duplicate) {
            await tx.put('ledger', result.ledger);
            await tx.put('sources', result.sources);
            const agent = (await tx.get('agent')) || emptyBusinessAgent();
            if (agent.enabled) {
              agent.nextRunAt = Date.now();
              await tx.put('agent', agent);
              await tx.setAlarm(agent.nextRunAt);
            }
          }
          return response({
            duplicate: result.duplicate,
            revision: result.ledger.revision,
            receipt: result.receipt,
          });
        }
        if (v.kind === 'source_status')
          return response(sourceStatus((await tx.get('sources')) || {}));
        if (
          [
            'agent_status',
            'agent_start',
            'agent_stop',
            'agent_watchdog',
            'articles',
          ].includes(v.kind)
        ) {
          const agent = (await tx.get('agent')) || emptyBusinessAgent();
          if (v.kind === 'agent_start' && !agent.enabled) {
            agent.enabled = true;
            agent.nextRunAt = Date.now();
            await tx.put('agent', agent);
            await tx.setAlarm(agent.nextRunAt);
          }
          if (v.kind === 'agent_stop') {
            agent.enabled = false;
            agent.nextRunAt = null;
            await tx.put('agent', agent);
            await tx.deleteAlarm();
          }
          if (
            v.kind === 'agent_watchdog' &&
            agent.enabled &&
            !(await tx.getAlarm())
          )
            await tx.setAlarm(
              Math.max(Date.now(), agent.nextRunAt || Date.now()),
            );
          if (v.kind === 'articles')
            return response({ articles: Object.values(agent.articles) });
          return response({
            ...agent,
            sources: sourceStatus((await tx.get('sources')) || {}),
          });
        }
        if (v.kind === 'snapshot') return response(state);
        if (v.kind === 'report')
          return response(businessReport(state, v.config));
        if (v.kind === 'draft') {
          const c = Object.hasOwn(state.campaigns, v.id)
            ? state.campaigns[v.id]
            : null;
          if (!c) return response({ error: '計画がありません。' }, 404);
          return response(campaignDraft(c, v.config));
        }
        if (v.kind === 'command') {
          const next = applyBusinessCommand(state, v.command);
          if (!next.duplicate) await tx.put('ledger', next.state);
          return response({
            revision: next.state.revision,
            duplicate: next.duplicate,
            report: businessReport(next.state, v.config),
          });
        }
        if (v.kind === 'lead') {
          const today = businessToday(),
            leads = Object.values(state.leads);
          if (
            leads.length >= 5000 ||
            leads.filter(
              (x) => businessToday(Date.parse(x.createdAt)) === today,
            ).length >= 200
          )
            return response({ error: '本日の受付上限です。' }, 429);
          // The public caller cannot write conversions, amounts, or approvals.
          const cid = Object.hasOwn(state.campaigns, v.campaign)
            ? v.campaign
            : 'direct';
          state.leads[v.leadId] = {
            id: v.leadId,
            uix: v.uix,
            campaign: cid,
            eligible: v.eligible === true,
            createdAt: new Date().toISOString(),
            referralIssued: v.referralIssued === true,
          };
          state.revision++;
          await tx.put('ledger', state);
          return response({ accepted: true });
        }
        return response({ error: '対応していない操作です。' }, 400);
      });
    } catch (e) {
      return response(
        {
          error: e instanceof Error ? e.message : '台帳の処理に失敗しました。',
        },
        400,
      );
    }
  }
}
