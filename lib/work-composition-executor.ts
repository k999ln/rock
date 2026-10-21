import { formatCitations, makeFreeArticle } from './mr-tools.ts';
import { decodeCsv, parseCsv, transformCsv } from './csv-transform.ts';
import {
  capabilityFor,
  CompositionError,
  COMPOSITION_TEXT_LIMIT,
  type CompositionArtifact,
  type CompositionNode,
  type CompositionState,
} from './work-composition.ts';

export async function executeCompositionNode(
  state: CompositionState,
  node: CompositionNode,
  source: string,
): Promise<CompositionArtifact> {
  if (!capabilityFor(node.tool)?.available)
    throw new CompositionError('この処理は合成実行への接続待ちです。', 409);
  const inputs = node.inputs.map((id): CompositionArtifact => {
    if (id === 'source')
      return {
        kind: state.plan.inputKind,
        text: source,
        status: 'passed',
        checks: [],
      };
    const artifact = state.artifacts[id];
    if (!artifact || artifact.status !== 'passed')
      throw new CompositionError('入力元の手順が未完了です。', 409);
    return artifact;
  });
  const input = inputs[0];
  let text = input.text;
  let checks: CompositionArtifact['checks'] = [];
  if (node.tool === 'mr-citations') text = formatCitations(input.text);
  else if (node.tool === 'mr-free-article') {
    const c = node.config;
    if (
      Object.keys(c).some(
        (key) =>
          ![
            'afterChars',
            'price',
            'summary',
            'paidContents',
            'noteUrl',
          ].includes(key),
      ) ||
      typeof c.summary !== 'string' ||
      typeof c.paidContents !== 'string' ||
      typeof c.noteUrl !== 'string' ||
      !Number.isInteger(c.afterChars) ||
      !Number.isInteger(c.price)
    )
      throw new CompositionError(
        '無料版の範囲・要点・価格・販売先を設定してください。',
      );
    text = makeFreeArticle({
      markdown: input.text,
      afterChars: Number(c.afterChars),
      price: Number(c.price),
      summary: c.summary,
      paidContents: c.paidContents,
      noteUrl: c.noteUrl,
    });
  } else if (node.tool === 'rockstar-csv-cleanup') {
    const result = await transformCsv(new TextEncoder().encode(input.text), {
      ...node.config,
      outputEncoding: 'utf8',
    });
    text = decodeCsv(result.output).text;
    checks = [
      ...result.report.validation.checks,
      ...result.report.warnings.map((detail) => ({
        name: '注意事項',
        passed: true,
        detail,
      })),
    ];
  } else if (node.tool === 'compose-join')
    text = inputs.map((item) => item.text).join('\n\n---\n\n');
  else if (node.tool === 'compose-check') {
    const { minChars = 1, requiredText = [] } = node.config;
    if (
      Object.keys(node.config).some(
        (key) => !['minChars', 'requiredText'].includes(key),
      ) ||
      !Number.isInteger(minChars) ||
      Number(minChars) < 1 ||
      Number(minChars) > COMPOSITION_TEXT_LIMIT ||
      !Array.isArray(requiredText) ||
      requiredText.length > 20 ||
      requiredText.some(
        (s) => typeof s !== 'string' || !s.trim() || s.length > 200,
      )
    )
      throw new CompositionError('検査条件を確認してください。');
    checks = [
      {
        name: '文字数',
        passed: Array.from(text).length >= Number(minChars),
        detail: `${Array.from(text).length}文字 / 最低${Number(minChars)}文字`,
      },
      ...requiredText.map((phrase) => ({
        name: '必須文言',
        passed: text.includes(phrase),
        detail: phrase as string,
      })),
    ];
    if (input.kind === 'csv') {
      const table = parseCsv(text);
      checks.push({
        name: 'CSV構造',
        passed: true,
        detail: `${table.headers.length}列 / ${table.rows.length}行`,
      });
    }
  }
  if (!text.trim() || text.length > COMPOSITION_TEXT_LIMIT)
    throw new CompositionError(
      `成果は1〜${COMPOSITION_TEXT_LIMIT}文字の範囲で作成してください。`,
      413,
    );
  return {
    kind:
      capabilityFor(node.tool)!.output === 'same'
        ? input.kind
        : (capabilityFor(node.tool)!.output as CompositionArtifact['kind']),
    text,
    status: checks.every((check) => check.passed) ? 'passed' : 'needs_review',
    checks,
  };
}
