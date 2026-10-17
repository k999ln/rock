export const SKY_CONVERSATION_DIAGRAM_MAX_INPUT = 50_000;
export const SKY_CONVERSATION_DIAGRAM_MAX_PARAGRAPHS = 50;
export const SKY_CONVERSATION_DIAGRAM_MAX_NODES = 6;

export type ConversationDiagramNode = {
  kind: '話題' | '問い' | '背景' | '理由' | '転換' | '判断' | '展開' | '着地';
  text: string;
};

export type ConversationParagraphDiagram = {
  id: string;
  index: number;
  title: string;
  original: string;
  nodes: ConversationDiagramNode[];
};

export type ConversationDiagramResult = {
  schema: 'sky.conversation-diagram/1';
  execution: 'first-party-rules';
  paragraphs: ConversationParagraphDiagram[];
  warnings: string[];
};

const fillers = /^(?:(?:えー+|えっと|あの+|まあ+|なんか|てか|うん|はい|そうですね|そうね)[、,。\s]*)+/u;
const causal = /(?:だから|なので|そのため|なぜなら|というのも|ので|から)/u;
const contrast = /(?:でも|ただ|一方で|しかし|けれど|けど)/u;
const decision = /(?:決め|選ん|したい|やりたい|方向性|方針|結論|思っと|思って)/u;
const question = /(?:[？?]|なぜ|どうして|どうすれば|何を|どれを)/u;
const background = /(?:もともと|以前|最初|前提|背景|きっかけ)/u;

function normalize(text: string) {
  return text.replace(/\r\n?/g, '\n').replace(/[\t\u00a0]+/g, ' ').trim();
}

function cleanSpeech(text: string) {
  return text.replace(/\s+/g, ' ').replace(fillers, '').trim();
}

function shorten(text: string, limit: number) {
  const value = cleanSpeech(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

function sentenceUnits(paragraph: string) {
  const sentences = paragraph
    .replace(/([。！？!?]+)/gu, '$1\n')
    .split(/\n+/u)
    .map(cleanSpeech)
    .filter(Boolean);
  const units: string[] = [];
  for (const sentence of sentences.length ? sentences : [paragraph]) {
    if (sentence.length <= 100) {
      units.push(sentence);
      continue;
    }
    const clauses = sentence.split(/(?<=、)/u).map(cleanSpeech).filter(Boolean);
    if (clauses.length < 2) {
      units.push(sentence);
      continue;
    }
    let current = '';
    for (const clause of clauses) {
      if (current && current.length + clause.length > 82) {
        units.push(current);
        current = clause;
      } else {
        current += clause;
      }
    }
    if (current) units.push(current);
  }
  return units;
}

function boundedUnits(paragraph: string) {
  const units = sentenceUnits(paragraph);
  if (units.length <= SKY_CONVERSATION_DIAGRAM_MAX_NODES) return units;
  const grouped: string[] = [];
  for (let index = 0; index < SKY_CONVERSATION_DIAGRAM_MAX_NODES; index += 1) {
    const start = Math.floor((index * units.length) / SKY_CONVERSATION_DIAGRAM_MAX_NODES);
    const end = Math.floor(((index + 1) * units.length) / SKY_CONVERSATION_DIAGRAM_MAX_NODES);
    grouped.push(units.slice(start, Math.max(start + 1, end)).join('／'));
  }
  return grouped;
}

function nodeKind(text: string, index: number, total: number): ConversationDiagramNode['kind'] {
  if (question.test(text)) return '問い';
  if (contrast.test(text)) return '転換';
  if (causal.test(text)) return '理由';
  if (decision.test(text)) return '判断';
  if (background.test(text)) return '背景';
  if (index === 0) return '話題';
  if (index === total - 1) return '着地';
  return '展開';
}

function paragraphTitle(units: string[], index: number) {
  const first = cleanSpeech(units[0] ?? '');
  const candidate = first.split(/[、,。！？!?]/u)[0]?.replace(/[「」『』“”"']/gu, '').trim();
  return candidate ? shorten(candidate, 28) : `段落 ${index + 1}`;
}

export function diagramConversation(input: string): ConversationDiagramResult {
  if (typeof input !== 'string') throw new Error('文字起こしを文字列で入力してください。');
  const normalized = normalize(input);
  if (!normalized) return {
    schema: 'sky.conversation-diagram/1', execution: 'first-party-rules', paragraphs: [], warnings: [],
  };
  if (normalized.length > SKY_CONVERSATION_DIAGRAM_MAX_INPUT) {
    throw new Error(`${SKY_CONVERSATION_DIAGRAM_MAX_INPUT.toLocaleString()}文字以内に分けてください。`);
  }
  const paragraphTexts = normalized.split(/\n\s*\n+/u).map(normalize).filter(Boolean);
  if (paragraphTexts.length > SKY_CONVERSATION_DIAGRAM_MAX_PARAGRAPHS) {
    throw new Error(`${SKY_CONVERSATION_DIAGRAM_MAX_PARAGRAPHS}段落以内に分けてください。`);
  }
  const paragraphs = paragraphTexts.map((original, index) => {
    const units = boundedUnits(original);
    return {
      id: `paragraph-${index + 1}`,
      index,
      title: paragraphTitle(units, index),
      original,
      nodes: units.map((text, nodeIndex) => ({
        kind: nodeKind(text, nodeIndex, units.length),
        text: shorten(text, 96),
      })),
    } satisfies ConversationParagraphDiagram;
  });
  const warnings = [
    '発言を短く区切るルール処理です。意味の推測、事実確認、話者の意図の補完は行いません。',
  ];
  return { schema: 'sky.conversation-diagram/1', execution: 'first-party-rules', paragraphs, warnings };
}

export function formatConversationDiagrams(result: ConversationDiagramResult) {
  return result.paragraphs.map((paragraph) => [
    `## ${paragraph.index + 1}. ${paragraph.title}`,
    paragraph.nodes.map((node) => `[${node.kind}] ${node.text}`).join('\n  ↓\n'),
    '',
    `元の段落: ${paragraph.original}`,
  ].join('\n')).join('\n\n');
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character);
}

function wrapNodeText(text: string, width = 24) {
  const lines: string[] = [];
  for (let offset = 0; offset < text.length; offset += width) lines.push(text.slice(offset, offset + width));
  return lines.length ? lines.slice(0, 4) : [''];
}

export function conversationDiagramToSvg(diagram: ConversationParagraphDiagram) {
  const width = 920;
  const nodeWidth = 720;
  const nodeX = (width - nodeWidth) / 2;
  const nodes = diagram.nodes.map((node, index) => {
    const lines = wrapNodeText(node.text);
    const nodeHeight = 70 + lines.length * 24;
    return { ...node, index, lines, nodeHeight };
  });
  let y = 126;
  const body: string[] = [];
  for (const node of nodes) {
    body.push(`<rect x="${nodeX}" y="${y}" width="${nodeWidth}" height="${node.nodeHeight}" rx="22" fill="#12212b" stroke="#416373"/>`);
    body.push(`<text x="${nodeX + 28}" y="${y + 31}" fill="#9bd7ad" font-size="15" font-weight="700">${escapeXml(node.kind)}</text>`);
    node.lines.forEach((line, lineIndex) => body.push(`<text x="${nodeX + 28}" y="${y + 65 + lineIndex * 24}" fill="#eef8f5" font-size="19">${escapeXml(line)}</text>`));
    y += node.nodeHeight;
    if (node.index < nodes.length - 1) {
      body.push(`<line x1="${width / 2}" y1="${y + 8}" x2="${width / 2}" y2="${y + 42}" stroke="#82b99a" stroke-width="3"/>`);
      body.push(`<path d="M ${width / 2 - 7} ${y + 34} L ${width / 2} ${y + 44} L ${width / 2 + 7} ${y + 34}" fill="none" stroke="#82b99a" stroke-width="3"/>`);
      y += 54;
    }
  }
  const height = y + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#09141b"/><text x="${nodeX}" y="54" fill="#8db5bf" font-size="15">SKY · 段落 ${diagram.index + 1}</text><text x="${nodeX}" y="91" fill="#ffffff" font-size="27" font-weight="700">${escapeXml(diagram.title)}</text>${body.join('')}</svg>`;
}
