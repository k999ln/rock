import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';
import {
  assessPatentReadiness,
  buildPatentPacket,
  buildPatentSearchQueries,
} from '../lib/patent-assistant.ts';
import {
  PATENT_AI_ALLOWED_DOMAINS,
  buildPatentAiRequest,
  parsePatentAiResponse,
} from '../lib/patent-ai.ts';

const completeInput = {
  inventionTitle: '承認状態を含む自動化ジョブ再開システム',
  problem:
    '複数の外部処理が中断したとき、安全な再開位置と人が承認した範囲を判定できない技術的課題がある。',
  mechanism:
    '各処理に冪等キーと承認状態を付与し、状態遷移表と実行証跡を照合して、許可済みの次の処理だけを実行する。',
  architecture:
    'クライアント、ポリシーゲートウェイ、実行器、証跡データベースを備え、署名付き状態を構成要素間で受け渡す。',
  technicalEffect:
    '重複した外部送信を防止しながら、中断後も最後に確認済みの状態から処理を再開できる。',
  differences:
    '一般的なジョブキューと異なり、人の承認範囲を状態遷移と同じ証跡に含め、外部作用の直前に再検証する。',
  knownPriorArt: '',
  inventor: '発明者候補',
  applicant: '出願人候補',
  disclosureStatus: 'not_disclosed',
  disclosureDate: undefined,
};

void test('patent assistant is a ready Sky browser tool', () => {
  const tool = catalog.find(
    (entry) => entry.id === 'rockstar-patent-assistant',
  );
  assert.equal(tool?.status, 'ready');
  assert.equal(tool?.runner, 'patent-assistant');
  assert.match(tool?.environment ?? '', /保存しません/);
  assert.match(tool?.note ?? '', /提出は自動実行しません/);
});

void test('complete technical intake becomes draft ready', () => {
  const result = assessPatentReadiness(completeInput);
  assert.equal(result.readiness, 'draft_ready');
  assert.equal(result.score, 100);
});

void test('public disclosure creates an urgent review warning', () => {
  const result = assessPatentReadiness({
    ...completeInput,
    disclosureStatus: 'already_disclosed',
    disclosureDate: '2026-09-01',
  });
  assert.equal(result.readiness, 'research_ready');
  assert.ok(result.warnings.some((warning) => warning.includes('出願前公開')));
});

void test('search plan includes official patent databases', () => {
  const plan = buildPatentSearchQueries(completeInput);
  assert.match(plan.japanese, /自動化ジョブ/);
  assert.ok(
    plan.databaseLinks.some((entry) => entry.url.includes('j-platpat')),
  );
  assert.ok(
    plan.databaseLinks.every((entry) => entry.url.startsWith('https://')),
  );
});

void test('filing packet contains documents and a human review gate', () => {
  const result = assessPatentReadiness(completeInput);
  const packet = buildPatentPacket(completeInput, result);
  assert.match(packet, /明細書ドラフト/);
  assert.match(packet, /特許請求の範囲ドラフト/);
  assert.match(packet, /要約書ドラフト/);
  assert.match(packet, /特許庁への提出を行いません/);
  assert.match(packet, /弁理士または知財担当者が最終レビューした/);
});

void test('patent AI request is stateless and official-source limited', () => {
  const request = buildPatentAiRequest(completeInput, '2026-09-12');
  assert.equal(request.store, false);
  assert.equal(request.tools[0]?.type, 'web_search');
  assert.deepEqual(request.tools[0]?.filters.allowed_domains, [
    ...PATENT_AI_ALLOWED_DOMAINS,
  ]);
});

void test('patent AI output requires an allowlisted citation', () => {
  const parsed = parsePatentAiResponse({
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: '公式資料で候補分類を確認しました。',
            annotations: [
              {
                type: 'url_citation',
                title: 'JPO',
                url: 'https://www.jpo.go.jp/system/patent/gaiyo/index.html',
              },
              {
                type: 'url_citation',
                title: 'Untrusted',
                url: 'https://example.com/patent',
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0]?.title, 'JPO');
  assert.throws(() =>
    parsePatentAiResponse({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '根拠なし' }],
        },
      ],
    }),
  );
});
