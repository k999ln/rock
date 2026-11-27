// Only these shipped, side-effect-free catalog programs may run on a participant.
import { formatCitations, makeFreeArticle, type FreeArticleInput } from './mr-tools.ts';
import { parseCsv, serializeCsv, expectedRows, type CsvSpecification } from './csv-table.ts';

export const EVE_WORKLOAD = 'eve-agent-chain-v1';
const CITATIONS = 'market:tool:mr-citations';
const ARTICLE = 'market:tool:mr-free-article';
const CSV = 'market:tool:rockstar-csv-cleanup';
export const EVE_AGENT_IDS: readonly string[] = Object.freeze([CITATIONS, ARTICLE, CSV]);
type ArticleOptions = Omit<FreeArticleInput, 'markdown'>;
export type EveRecipe = { agents: string[]; source: string; options?: ArticleOptions };

export function isEveParticipantAgent(value: unknown): value is string {
  return typeof value === 'string' && EVE_AGENT_IDS.includes(value);
}

function fields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some(key => !allowed.includes(key))) throw new Error('未対応の入力項目があります。');
  return input as Record<string, unknown>;
}

/* eslint-disable no-control-regex -- Reject control characters in public input. */
function boundedText(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxBytes ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) ||
      new TextEncoder().encode(value).length > maxBytes || /[\uD800-\uDFFF]/u.test(value)) {
    throw new Error('文字や長さを確認してください（上限' + maxBytes + 'バイト）。');
  }
  return value;
}

/* eslint-enable no-control-regex */

function integer(value: unknown, max: number, name: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(name + 'を1〜' + max + 'の整数で指定してください。');
  return value;
}

export function normalizeEveRecipe(value: unknown): EveRecipe {
  const input = fields(value, ['agents', 'source', 'options']);
  if (!Array.isArray(input.agents) || input.agents.length < 1 || input.agents.length > 4 ||
      !input.agents.every(isEveParticipantAgent)) throw new Error('端末に登録されたAgentを1〜4件選んでください。');
  const agents: string[] = [...input.agents];
  if (agents.includes(CSV) && agents.some(id => id !== CSV)) throw new Error('CSVと記事の工程は入力形式が異なります。');
  const source = boundedText(input.source, 4096);
  if (!agents.includes(ARTICLE)) {
    if (input.options !== undefined) throw new Error('この組み合わせに記事の設定は不要です。');
    return { agents, source };
  }
  const options = fields(input.options, ['afterChars', 'price', 'summary', 'paidContents', 'noteUrl']);
  const noteUrl = boundedText(options.noteUrl, 400);
  // This is public output metadata. The executor never dereferences it.
  if (!/^https:\/\/note\.com\/[A-Za-z0-9_-]+\/n\/[A-Za-z0-9_-]+\/?$/u.test(noteUrl))
    throw new Error('公開するnote記事のURL（https://note.com/作者/n/記事ID）を入力してください。');
  const summary = boundedText(options.summary, 768);
  const bullets = summary.split(/\r?\n/u).filter(line => line.trim());
  if (bullets.length < 3 || bullets.length > 5 || bullets.some(line => !/^[-*]\s+\S/u.test(line.trim())))
    throw new Error('要点は3〜5行の箇条書きで指定してください。');
  return { agents, source, options: {
    afterChars: integer(options.afterChars, 100000, '無料範囲'),
    price: integer(options.price, 1000000, '表示価格'),
    summary, paidContents: boundedText(options.paidContents, 768), noteUrl,
  } };
}

function cleanCsv(source: string) {
  const table = parseCsv(source.replace(/^\uFEFF/u, ''));
  const spec: CsvSpecification = { renames: Object.create(null), order: [], trim: table.headers,
    dedupe: { keys: table.headers, mode: 'first' }, sort: [], outputEncoding: 'utf8', spreadsheetSafe: true };
  const { headers, rows } = expectedRows(table, spec);
  // A downloaded CSV can be opened in a spreadsheet. Quote formula-leading cells in its safe edition.
  const safe = (cell: string) => /^[=+@-]/u.test(cell.trimStart()) ? "'" + cell : cell;
  return serializeCsv({ headers: headers.map(safe), rows: rows.map(row => row.map(safe)) });
}

export function runEveAgents(value: unknown): { text: string; steps: string[] } {
  const recipe = normalizeEveRecipe(value);
  let text = recipe.source;
  for (const agent of recipe.agents) {
    if (agent === CSV) text = cleanCsv(text);
    else if (agent === CITATIONS) text = formatCitations(text);
    else text = makeFreeArticle({ ...recipe.options!, markdown: text });
    boundedText(text, 12288);
  }
  return { text, steps: recipe.agents };
}
