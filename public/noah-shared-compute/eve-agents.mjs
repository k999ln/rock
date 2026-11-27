/* Generated from the shipped Noah tools.
MIT License

Copyright (c) Anicca contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// lib/mr-tools.ts
var MR_COMMIT = "26a39d2c31ea5246cb78dbe42d86e333922db60c";
var MR_SOURCE = `https://github.com/k999ln/Mr./tree/${MR_COMMIT}`;
var MAX_TEXT = 1e5;
function textInput(value, name = "本文") {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}を入力してください。`);
  if (value.length > MAX_TEXT) throw new Error(`${name}は10万文字以内にしてください。`);
  return value.replace(/\r\n?/g, "\n");
}
function protectCode(body) {
  let marker = "ROCK_STAR_CODE_";
  while (body.includes(marker)) marker += "X";
  const preserved = [];
  const keep = (value) => {
    const token = marker + preserved.length + "";
    preserved.push(value);
    return token;
  };
  const lines = body.split("\n");
  const output = [];
  let i = 0;
  while (i < lines.length) {
    const match = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (match) {
      const block = [lines[i++]];
      const close = new RegExp("^\\s*" + match[1][0] + "{" + match[1].length + ",}\\s*$");
      while (i < lines.length) {
        const line = lines[i++];
        block.push(line);
        if (close.test(line)) break;
      }
      output.push(keep(block.join("\n")));
    } else {
      output.push(lines[i++].replace(/(`+)([^\n]*?)\1(?!`)/g, (m) => keep(m)));
    }
  }
  return { text: output.join("\n"), restore: (value) => preserved.reduce((out, code, index) => out.split(marker + index + "").join(code), value) };
}
function formatCitations(input, language = "ja") {
  const protectedText = protectCode(textInput(input));
  const body = protectedText.text;
  const seen = /* @__PURE__ */ new Set();
  const pairs = [];
  const citationPattern = language === "en" ? /(?:\(Source:\s*(?:\[[^\]]+\]\([^)]+\)\s*)+\)|（出典:\s*[^）]*）)/g : /（出典:\s*[^）]*）/g;
  const cleaned = body.replace(citationPattern, (citation) => {
    const found = [...citation.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    if (!found.length) return citation;
    for (const match of found) {
      if (!seen.has(match[2])) {
        seen.add(match[2]);
        pairs.push([match[1], match[2]]);
      }
    }
    return "";
  }).replace(/。。+/g, "。").replace(/、、+/g, "、").replace(/ {2,}/g, " ").replace(/\s+(?=[。、])/g, "").replace(/\n{3,}/g, "\n\n");
  const heading = language === "en" ? "Sources" : "出典";
  let result;
  if (!pairs.length) result = cleaned.trimEnd() + "\n";
  else {
    const header = new RegExp(`^##\\s*${heading}\\s*$`, "m").exec(cleaned);
    if (header) {
      const end = header.index + header[0].length;
      const tail = cleaned.slice(end);
      const next = /^## /m.exec(tail);
      const existing = next ? tail.slice(0, next.index) : tail;
      const after = next ? tail.slice(next.index) : "";
      const urls = new Set([...existing.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => match[2]));
      const additions = pairs.filter((pair) => !urls.has(pair[1]));
      result = additions.length ? `${cleaned.slice(0, end)}
${existing.trimEnd()}
${additions.map(([label, url]) => `- [${label}](${url})`).join("\n")}

${after}`.trimEnd() + "\n" : cleaned.trimEnd() + "\n";
    } else {
      result = cleaned.trimEnd() + `
---

## ${heading}

${pairs.map(([label, url]) => `- [${label}](${url})`).join("\n")}
`;
    }
  }
  return protectedText.restore(result);
}
var plain = (s) => s.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
function segments(body) {
  const lines = body.split("\n");
  const out = [];
  let buf = [], pid = 0, i = 0;
  const flush = () => {
    if (!buf.length) return;
    const text = buf.map((l) => l.trim()).filter(Boolean).join(" ");
    buf = [];
    for (const raw of text.match(/[^。]*。|[^。]+$/g) || []) if (raw.trim()) out.push({ type: "sentence", raw, paraId: pid });
    pid++;
  };
  while (i < lines.length) {
    const line = lines[i], s = line.trim();
    if (s.startsWith("```")) {
      flush();
      const code = [line];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      if (i >= lines.length) throw new Error("コードブロックを閉じてから作成してください。");
      code.push(lines[i++]);
      out.push({ type: "code", raw: code.join("\n") });
      continue;
    }
    if (!s) {
      flush();
      i++;
      continue;
    }
    if (s === "---" || /^#{1,6}\s/.test(s) || /^[-*]\s/.test(s)) {
      flush();
      out.push({ type: s === "---" ? "hr" : s.startsWith("#") ? "heading" : "bullet", raw: line });
      i++;
      continue;
    }
    buf.push(line);
    i++;
  }
  flush();
  return out;
}
function renderSegments(items) {
  const lines = [];
  let i = 0;
  while (i < items.length) {
    const s = items[i];
    if (s.type === "sentence") {
      const joined = [];
      while (i < items.length && items[i].type === "sentence" && items[i].paraId === s.paraId) joined.push(items[i++].raw);
      lines.push(joined.join(""), "");
    } else if (s.type === "bullet") {
      while (i < items.length && items[i].type === "bullet") lines.push(items[i++].raw);
      lines.push("");
    } else {
      lines.push(s.raw, "");
      i++;
    }
  }
  return lines.join("\n").trimEnd();
}
function sourceSection(body) {
  const lines = body.split("\n");
  let start = -1, level = 0, fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (fence) {
      if (fence.test(line)) fence = null;
      continue;
    }
    const fm = /^(`{3,}|~{3,})/.exec(line);
    if (fm) {
      fence = new RegExp("^" + fm[1][0] + "{" + fm[1].length + ",}\\s*$");
      continue;
    }
    const m = /^(#{1,6})\s*(Sources|出典)\s*$/i.exec(line);
    if (m) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  fence = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (fence) {
      if (fence.test(line)) fence = null;
      continue;
    }
    const fm = /^(`{3,}|~{3,})/.exec(line);
    if (fm) {
      fence = new RegExp("^" + fm[1][0] + "{" + fm[1].length + ",}\\s*$");
      continue;
    }
    const m = /^(#{1,6})\s/.exec(line);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  if (fence) throw new Error("出典欄のコードブロックを閉じてください。");
  return { raw: lines.slice(start, end).join("\n").trimEnd(), body: [...lines.slice(0, start), ...lines.slice(end)].join("\n") };
}
function makeFreeArticle(input) {
  const source = textInput(input.markdown, "原稿");
  if (!Number.isInteger(input.afterChars) || input.afterChars < 1 || input.afterChars > MAX_TEXT) throw new Error("無料範囲は1〜100,000文字の整数にしてください。");
  if (!Number.isInteger(input.price) || input.price < 1 || input.price > 1e6) throw new Error("価格は1〜1,000,000円の整数にしてください。");
  const summary = textInput(input.summary, "まとめ").split("\n").map((s) => s.trim()).filter((s) => /^[-*]\s+/.test(s)).map((s) => s.replace(/^[-*]\s+/, ""));
  if (summary.length < 3 || summary.length > 5) throw new Error("まとめは「- 」で始まる箇条書き3〜5個にしてください。");
  const paidContents = textInput(input.paidContents, "完全版の内容").trim();
  let url;
  try {
    url = new URL(input.noteUrl);
  } catch {
    throw new Error("完全版のURLを入力してください。");
  }
  if (url.protocol !== "https:" || url.hostname !== "note.com" || url.username || url.password || !/^\/[^/]+\/n\/[^/]+/.test(url.pathname)) throw new Error("https://note.com/ で始まる記事URLを入力してください。");
  const lines = source.split("\n");
  const title = /^#\s+/.test(lines[0].trim()) ? lines.shift() : null;
  const body = lines.join("\n");
  const sourceInfo = sourceSection(body);
  const all = segments(sourceInfo ? sourceInfo.body : body);
  const kept = [];
  let count = 0, cut = -1;
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    kept.push(s);
    if (s.type !== "code") {
      count += Array.from(plain(s.raw)).length;
      if (count >= input.afterChars) {
        cut = i;
        break;
      }
    }
  }
  if (cut < 0 || !all.slice(cut + 1).some((s) => s.type === "sentence" || s.type === "bullet" || s.type === "code")) throw new Error("無料範囲が長すぎます。完全版に残す本文ができるよう短くしてください。");
  const truncated = renderSegments(kept);
  const sources = sourceInfo?.raw;
  const parts = [...title ? [title, ""] : [], truncated, "", "---", "", "## まとめ", "", ...summary.map((s) => "- " + s), "", ...sources ? [sources, ""] : [], "---", "", `この記事は無料版です。完全版（note・${input.price.toLocaleString("en-US")}円買い切り）には、この続き（${paidContents}）が入っています。`, "", input.noteUrl.trim(), ""];
  const output = parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  if (output.split("\n").some((l) => /^#{2,6}\s/.test(l.trim()) && l.includes("続き"))) throw new Error("「続き」を含む見出しを変更してください。");
  if (output.includes("——")) throw new Error("原稿中の「——」を別の表現に変更してください。");
  return output;
}

// lib/csv-table.ts
var CSV_LIMITS = {
  bytes: 10 * 1024 * 1024,
  rows: 5e4,
  columns: 100
};
var CsvError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function parseCsv(source) {
  if (source.includes("\0"))
    throw new CsvError("NUL", "NUL文字を含むCSVは処理できません。");
  const records = [];
  let row = [], field = "", quoted = false, closedQuote = false;
  const pushField = () => {
    row.push(field);
    field = "";
    closedQuote = false;
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else field += char;
      continue;
    }
    if (closedQuote && char !== "," && char !== "\r" && char !== "\n")
      throw new CsvError("CSV_SYNTAX", "引用符の後に不正な文字があります。");
    if (char === '"') {
      if (field.length)
        throw new CsvError("CSV_SYNTAX", "引用符の位置が不正です。");
      quoted = true;
    } else if (char === ",") pushField();
    else if (char === "\n") pushRow();
    else if (char === "\r") {
      if (source[i + 1] === "\n") i += 1;
      pushRow();
    } else field += char;
  }
  if (quoted) throw new CsvError("CSV_SYNTAX", "引用符が閉じていません。");
  if (field.length || row.length || !records.length) pushRow();
  while (records.length > 1 && records.at(-1)?.every((cell) => cell === ""))
    records.pop();
  const headers = records.shift() ?? [];
  if (!headers.length || headers.some((header) => !header))
    throw new CsvError("HEADER", "空の列名があります。");
  if (new Set(headers).size !== headers.length)
    throw new CsvError("HEADER", "同じ列名が複数あります。");
  if (headers.length > CSV_LIMITS.columns)
    throw new CsvError("TOO_MANY_COLUMNS", "列数は100以下にしてください。");
  if (records.length > CSV_LIMITS.rows)
    throw new CsvError(
      "TOO_MANY_ROWS",
      "データ行は50,000行以下にしてください。"
    );
  records.forEach((record, index) => {
    if (record.length !== headers.length)
      throw new CsvError(
        "ROW_WIDTH",
        `${index + 2}行目の列数が見出しと一致しません。`
      );
  });
  return { headers, rows: records };
}
var edgeWhitespace = /^[\s\u3000]+|[\s\u3000]+$/gu;
function compare(a, b) {
  let aIndex = 0;
  let bIndex = 0;
  while (aIndex < a.length && bIndex < b.length) {
    const aPoint = a.codePointAt(aIndex);
    const bPoint = b.codePointAt(bIndex);
    if (aPoint !== bPoint) return aPoint < bPoint ? -1 : 1;
    aIndex += aPoint > 65535 ? 2 : 1;
    bIndex += bPoint > 65535 ? 2 : 1;
  }
  return aIndex < a.length ? 1 : bIndex < b.length ? -1 : 0;
}
function plan(table, spec) {
  const renamed = table.headers.map((header) => spec.renames[header] ?? header);
  if (renamed.some((header) => !header) || new Set(renamed).size !== renamed.length)
    throw new CsvError(
      "SPEC_COLUMNS",
      "列名変更後の列名が空または重複しています。"
    );
  for (const from of Object.keys(spec.renames))
    if (!table.headers.includes(from))
      throw new CsvError("SPEC_COLUMNS", `変更元の列「${from}」がありません。`);
  const outputHeaders = spec.order.length ? spec.order : renamed;
  if (outputHeaders.length !== renamed.length || new Set(outputHeaders).size !== renamed.length || outputHeaders.some((header) => !renamed.includes(header)))
    throw new CsvError(
      "SPEC_COLUMNS",
      "列順には変更後の全列を重複なく指定してください。"
    );
  for (const column of [
    ...spec.trim,
    ...spec.dedupe.keys,
    ...spec.sort.map((item) => item.column)
  ])
    if (!renamed.includes(column))
      throw new CsvError("SPEC_COLUMNS", `指定列「${column}」がありません。`);
  return {
    renamed,
    outputHeaders,
    sourceIndex: new Map(renamed.map((header, index) => [header, index]))
  };
}
function expectedRows(table, spec) {
  const { outputHeaders, sourceIndex } = plan(table, spec);
  let trimmedCells = 0;
  let rows = table.rows.map((record, originalIndex) => ({
    originalIndex,
    cells: outputHeaders.map((header) => {
      const raw = record[sourceIndex.get(header)];
      if (!spec.trim.includes(header)) return raw;
      const clean = raw.replace(edgeWhitespace, "");
      if (clean !== raw) trimmedCells += 1;
      return clean;
    })
  }));
  const keyIndexes = spec.dedupe.keys.map((key) => outputHeaders.indexOf(key));
  const counts = /* @__PURE__ */ new Map();
  if (keyIndexes.length) {
    for (const item of rows) {
      const key = JSON.stringify(keyIndexes.map((index) => item.cells[index]));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const duplicateRows = [...counts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
  if (keyIndexes.length && spec.dedupe.mode !== "report_only") {
    const chosen = /* @__PURE__ */ new Map();
    for (const item of rows) {
      const key = JSON.stringify(keyIndexes.map((index) => item.cells[index]));
      if (spec.dedupe.mode === "last" || !chosen.has(key))
        chosen.set(key, item);
    }
    const kept = new Set(
      [...chosen.values()].map((item) => item.originalIndex)
    );
    rows = rows.filter((item) => kept.has(item.originalIndex));
  }
  if (spec.sort.length) {
    const sorting = spec.sort.map((entry) => ({
      index: outputHeaders.indexOf(entry.column),
      direction: entry.direction
    }));
    rows.sort((a, b) => {
      for (const item of sorting) {
        const value = compare(a.cells[item.index], b.cells[item.index]);
        if (value) return item.direction === "asc" ? value : -value;
      }
      return a.originalIndex - b.originalIndex;
    });
  }
  return {
    headers: outputHeaders,
    rows: rows.map((item) => item.cells),
    trimmedCells,
    duplicateRows
  };
}
function csvCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
function serializeCsv(table) {
  return [table.headers, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// lib/noah-eve-agent-program.ts
var EVE_WORKLOAD = "eve-agent-chain-v1";
var CITATIONS = "market:tool:mr-citations";
var ARTICLE = "market:tool:mr-free-article";
var CSV = "market:tool:rockstar-csv-cleanup";
var EVE_AGENT_IDS = Object.freeze([CITATIONS, ARTICLE, CSV]);
function isEveParticipantAgent(value) {
  return typeof value === "string" && EVE_AGENT_IDS.includes(value);
}
function fields(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("未対応の入力項目があります。");
  return input;
}
function boundedText(value, maxBytes) {
  if (typeof value !== "string" || !value.trim() || value.length > maxBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || new TextEncoder().encode(value).length > maxBytes || /[\uD800-\uDFFF]/u.test(value)) {
    throw new Error("文字や長さを確認してください（上限" + maxBytes + "バイト）。");
  }
  return value;
}
function integer(value, max, name) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(name + "を1〜" + max + "の整数で指定してください。");
  return value;
}
function normalizeEveRecipe(value) {
  const input = fields(value, ["agents", "source", "options"]);
  if (!Array.isArray(input.agents) || input.agents.length < 1 || input.agents.length > 4 || !input.agents.every(isEveParticipantAgent)) throw new Error("端末に登録されたAgentを1〜4件選んでください。");
  const agents = [...input.agents];
  if (agents.includes(CSV) && agents.some((id) => id !== CSV)) throw new Error("CSVと記事の工程は入力形式が異なります。");
  const source = boundedText(input.source, 4096);
  if (!agents.includes(ARTICLE)) {
    if (input.options !== void 0) throw new Error("この組み合わせに記事の設定は不要です。");
    return { agents, source };
  }
  const options = fields(input.options, ["afterChars", "price", "summary", "paidContents", "noteUrl"]);
  const noteUrl = boundedText(options.noteUrl, 400);
  if (!/^https:\/\/note\.com\/[A-Za-z0-9_-]+\/n\/[A-Za-z0-9_-]+\/?$/u.test(noteUrl))
    throw new Error("公開するnote記事のURL（https://note.com/作者/n/記事ID）を入力してください。");
  const summary = boundedText(options.summary, 768);
  const bullets = summary.split(/\r?\n/u).filter((line) => line.trim());
  if (bullets.length < 3 || bullets.length > 5 || bullets.some((line) => !/^[-*]\s+\S/u.test(line.trim())))
    throw new Error("要点は3〜5行の箇条書きで指定してください。");
  return { agents, source, options: {
    afterChars: integer(options.afterChars, 1e5, "無料範囲"),
    price: integer(options.price, 1e6, "表示価格"),
    summary,
    paidContents: boundedText(options.paidContents, 768),
    noteUrl
  } };
}
function cleanCsv(source) {
  const table = parseCsv(source.replace(/^\uFEFF/u, ""));
  const spec = {
    renames: /* @__PURE__ */ Object.create(null),
    order: [],
    trim: table.headers,
    dedupe: { keys: table.headers, mode: "first" },
    sort: [],
    outputEncoding: "utf8",
    spreadsheetSafe: true
  };
  const { headers, rows } = expectedRows(table, spec);
  const safe = (cell) => /^[=+@-]/u.test(cell.trimStart()) ? "'" + cell : cell;
  return serializeCsv({ headers: headers.map(safe), rows: rows.map((row) => row.map(safe)) });
}
function runEveAgents(value) {
  const recipe = normalizeEveRecipe(value);
  let text = recipe.source;
  for (const agent of recipe.agents) {
    if (agent === CSV) text = cleanCsv(text);
    else if (agent === CITATIONS) text = formatCitations(text);
    else text = makeFreeArticle({ ...recipe.options, markdown: text });
    boundedText(text, 12288);
  }
  return { text, steps: recipe.agents };
}
export {
  EVE_AGENT_IDS,
  EVE_WORKLOAD,
  isEveParticipantAgent,
  normalizeEveRecipe,
  runEveAgents
};
