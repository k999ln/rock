import { testScenarios, type TestResult } from './test-workspace.ts';
import { formatCitations, makeFreeArticle, checkCoconala } from './mr-tools.ts';
import { transformCsv, serializeCsv } from './csv-transform.ts';
import { buildFashionQuickPlan } from './fashion-quick-plan.ts';
import { createMercariRevenuePlan } from './mercari-revenue.ts';
import {
  assessLegalIntake,
  buildHandoffSummary,
  type LegalIntakeInput,
} from './legal-intake.ts';
import {
  assessPatentReadiness,
  buildPatentPacket,
  type PatentIntakeInput,
} from './patent-assistant.ts';
import { validateMarketProposal } from './everything-market.ts';
import { createWorkJob, applyWorkCommand } from './workflow.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);
function number(value: string, max = 1_000_000) {
  const result = Number(value);
  if (
    !value.trim() ||
    !Number.isSafeInteger(result) ||
    result < 0 ||
    result > max
  )
    throw new Error(`0〜${max}の整数を入力してください。`);
  return result;
}

/** Deliberately stateless. No credentials, stores, providers, shell or generic tool dispatch. */
export async function executeOutputTest(raw: unknown): Promise<TestResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('入力を確認してください。');
  const request = raw as Record<string, unknown>;
  if (Object.keys(request).some((key) => !['id', 'values'].includes(key)))
    throw new Error('未対応の入力です。');
  const scenario = testScenarios.find((item) => item.id === request.id);
  if (!scenario) throw new Error('このテストはありません。');
  if (
    !request.values ||
    typeof request.values !== 'object' ||
    Array.isArray(request.values)
  )
    throw new Error('入力がありません。');
  const values = request.values as Record<string, string>;
  if (
    Object.keys(values).some(
      (key) => !scenario.fields.some((field) => field.key === key),
    )
  )
    throw new Error('未対応の入力欄です。');
  for (const field of scenario.fields) {
    if (
      typeof values[field.key] !== 'string' ||
      !values[field.key].trim() ||
      values[field.key].length > 12_000
    )
      throw new Error(`${field.label}は1〜12,000文字で入力してください。`);
  }
  const { text = '' } = values;
  const result: TestResult = {
    id: scenario.id,
    name: scenario.name,
    mode: scenario.mode,
    status: 'output',
    scope: scenario.scope,
    output: '',
    format: 'txt',
    executedAt: new Date().toISOString(),
  };
  switch (scenario.id) {
    case 'rockstar-csv-cleanup': {
      const converted = await transformCsv(new TextEncoder().encode(text), {
        trim: [],
        dedupe: { keys: [values.key], mode: 'first' },
        sort: [{ column: values.key, direction: 'asc' }],
        outputEncoding: 'utf8',
        spreadsheetSafe: true,
      });
      // Resolve every column from the real parser, then apply the requested cleanup.
      const clean = await transformCsv(new TextEncoder().encode(text), {
        ...converted.spec,
        trim: converted.input.headers,
      });
      result.output = new TextDecoder().decode(
        clean.safeOutput ?? clean.output,
      );
      result.format = 'csv';
      result.details = {
        ...clean.report,
        outputSha256: clean.outputSha256,
        rawCsv: serializeCsv(clean.outputTable),
      };
      break;
    }
    case 'mr-citations':
      result.output = formatCitations(text);
      break;
    case 'mr-free-article':
      result.output = makeFreeArticle({
        markdown: text,
        afterChars: 20,
        summary: values.summary,
        price: 500,
        paidContents: '手順の続き（テスト）',
        noteUrl: 'https://note.com/test/n/test',
      });
      break;
    case 'coconala': {
      const checked = checkCoconala({
        brief: text,
        proposal: values.proposal,
        bucket: 'single',
        orderRate: null,
      });
      result.output = [
        checked.summary,
        ...checked.reasons,
        ...checked.signals,
        ...checked.rankingNotes,
      ].join('\n');
      result.details = checked;
      break;
    }
    case 'fashion-brand-ops': {
      const plan = buildFashionQuickPlan({
        brandDirection: text,
        productDesign: values.product,
      });
      result.output = `${plan.campaignTitle}\n\n${plan.launchLine}\n\n【投稿文】\n${plan.caption}\n\n【画像制作指示】\n${plan.imageBrief}\n\n【動画制作指示】\n${plan.videoBrief}`;
      result.details = plan;
      break;
    }
    case 'mercari-revenue': {
      const plan = createMercariRevenuePlan({
        id: crypto.randomUUID(),
        channel: 'consumer_assisted',
        title: text,
        condition: '架空在庫・試験入力',
        facts: values.facts,
        priceJPY: number(values.price),
        marketplaceFeeJPY: 500,
        shippingJPY: 750,
        itemCostJPY: 1000,
        otherCostJPY: 0,
        ownsStock: true,
        accurate: true,
        prohibitedChecked: true,
      });
      result.output = `テスト在庫のみ・出品未実施\n\n${plan.listingDraft}\n\n見込み利益: ${plan.expectedNetJPY}円\n仮定: 手数料500円 / 送料750円 / 原価1000円`;
      result.details = {
        ...plan,
        safeguards: 'fixture_only_not_user_attestation',
      };
      break;
    }
    case 'rockstar-legal-intake': {
      const input: LegalIntakeInput = {
        issueType: 'business',
        location: 'other',
        matterStage: 'general_information',
        situationSummary: text,
        desiredOutcome: values.outcome,
        immediateDanger: false,
        detainedOrArrested: false,
        domesticViolence: false,
        receivedOfficialDocument: false,
        contactPreference: 'email',
      };
      result.output = buildHandoffSummary(input, assessLegalIntake(input));
      break;
    }
    case 'rockstar-patent-assistant': {
      const input: PatentIntakeInput = {
        inventionTitle: text,
        mechanism: values.mechanism,
        problem: '',
        architecture: '',
        technicalEffect: '',
        differences: '',
        knownPriorArt: '',
        inventor: '',
        applicant: '',
        disclosureStatus: 'unknown',
      };
      const assessment = assessPatentReadiness(input);
      result.output = buildPatentPacket(input, assessment);
      result.details = assessment;
      break;
    }
    case 'mr-delivery': {
      const bytes = new TextEncoder().encode(text);
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      result.output = `テキスト照合結果\n文字数: ${Array.from(text).length}\nUTF-8: ${bytes.length} bytes\nSHA-256: ${hash}\n\nPCファイルとの比較: 未実施\n納品・送信: 未実施`;
      break;
    }
    case 'rockstar-ledger':
      result.output = `模擬台帳\n${text}\n月額: ${number(values.amount).toLocaleString('ja-JP')}円\n年額換算: ${(number(values.amount) * 12).toLocaleString('ja-JP')}円\n\n契約先との照合・支払・解約: 未実施`;
      break;
    case 'rockstar-markets-analysis': {
      const proposal = validateMarketProposal({
        assetId: 'rock:campaign-pack',
        side: 'buy',
        mode: 'PAPER',
        priceMinor: number(values.price),
        quantity: number(values.quantity, 10_000),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      const total = proposal.priceMinor * proposal.quantity;
      result.output = `PAPER入力検査: 合格\n仮注文額: ${total}\n架空の開始残高: 100000\n残高だけの検査: ${total <= 100000 ? '範囲内' : '不足'}\n\nリスク総合判定・承認・約定・外部注文: 未実施`;
      result.details = proposal;
      break;
    }
    case 'test-wallet': {
      const reserved = number(values.amount, 10_000),
        spent = number(values.spent, 10_000);
      if (spent > reserved) throw new Error('使用額が予約額を超えています。');
      result.output = `模擬台帳・実資金なし\n開始残高: 10000\n予約: ${reserved}\n予約中の利用可能額: ${10000 - reserved}\n使用: ${spent}\n予約から戻す額: ${reserved - spent}\n終了残高: ${10000 - spent}\n\n正式台帳への記帳・送金: 未実施`;
      break;
    }
    case 'test-zema': {
      const job = createWorkJob({
        id: crypto.randomUUID(),
        title: text,
        templateId: 'article',
      });
      const next = applyWorkCommand(
        job,
        {
          id: crypto.randomUUID(),
          action: 'record',
          stepId: 'citations',
          tool: 'mr-citations',
          transport: 'browser',
          outcome: 'passed',
          sample: true,
          durationMs: 0,
        },
        job.revision,
      );
      result.output = `仕事: ${next.title}\n状態: ${job.status} → ${next.status}\nrevision: ${job.revision} → ${next.revision}\n試験履歴: ${next.events.length}件\n\nサンプルのため本番の完了条件には計上しません。本人の仕事一覧には保存されません。`;
      result.details = next;
      break;
    }
    default:
      result.status = 'not_run';
      result.output = json({
        status: 'not_run',
        requestedInput: text,
        answer: null,
        reason: scenario.scope,
        required:
          scenario.id === 'test-cloud-ai'
            ? ['接続先', '利用資格・鍵', '利用上限の設定']
            : ['実行アダプターの接続', '必要な権限と実行環境の確認'],
      });
  }
  return result;
}
