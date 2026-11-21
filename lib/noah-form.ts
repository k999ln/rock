// Promoted from docs/contracts/noah-form-v1.ts for launch L4.
/**
 * Noah 入力欄で頼む（モデルを使わない）: 道具の定義から入力欄を作り、入力を道具の引数へ直し、結果を文字にする。
 * ローンチの最小限（docs/noah/mvp-launch.md）で、相手のサーバーの Agent を使う唯一の道。
 *
 * Design contract only. No network calls, credentials or production mutations.
 * 提供者が書いた文（道具の名前・説明・項目名）は、そのまま文字として出す。Noah は文を作らない。
 * このファイルに、提供者の文を命令として読む所は無い。提供者の正規表現（pattern）は実行しない。
 * 仕様の本文は docs/noah/spec-87-tool-agent.md の 11 章。
 */
import { canonicalJson, sha256Hex } from './noah-connect-requirements.ts';
import type { NoahToolDef } from './noah-mouth-mcp-remote.ts';

/** 数値は候補。実測（握手が通った 276 host・道具 3,699 個）は docs/design-validation/noah/README.md。 */
export const NOAH_FORM_LIMITS = {
  /** 1 つの道具に出す入力欄の数。必須は全部出し、任意は入る所まで。 */
  fields: 24,
  /** 必須の入力がこれを越える道具は、入力欄で使わない。 */
  requiredFields: 12,
  choices: 200,
  listItems: 50,
  labelChars: 80,
  helpChars: 300,
  /** 道具の一覧に出す説明の長さ。実測の説明は中央値 310 文字・最大 22,393 文字。 */
  summaryChars: 160,
  /** 入力の全体（引数を JSON にした大きさ）。既存の LIMITS.inputBytes と同じ。 */
  inputBytes: 12_000,
  /** 成果の文。既存の LIMITS.resultBytes と同じ。 */
  resultBytes: 131_072,
  outlineRows: 300,
  outlineDepth: 5,
};

export type NoahFormValue = string | number | boolean;
export type NoahFormField = {
  /** 道具へ渡す時の項目名。そのまま使う。 */
  name: string;
  /** 項目の title。無ければ name。 */
  label: string;
  /** 項目の説明の先頭。 */
  help: string;
  kind: 'text' | 'number' | 'boolean' | 'choice' | 'list';
  required: boolean;
  /** number で、整数だけを受ける。 */
  integer?: true;
  /** choice の選択肢。list で、1 件ずつ選ぶ時の選択肢。 */
  choices?: NoahFormValue[];
  /** list の 1 件の形。 */
  itemKind?: 'text' | 'number';
  default?: NoahFormValue | NoahFormValue[];
  /** number の下限・上限。list の件数の下限・上限。 */
  min?: number;
  max?: number;
  maxLength?: number;
  format?: 'date' | 'date-time' | 'email' | 'uri';
};
export type NoahToolForm =
  | {
      usable: true;
      tool: string;
      fields: NoahFormField[];
      /** 定義が 1 つの値に決めている必須の項目（const）。画面に出さず、そのまま渡す。 */
      fixed: Record<string, NoahFormValue>;
      /** 入力欄にできなかった任意の項目の数。 */
      omitted: number;
    }
  | {
      usable: false;
      tool: string;
      reason: 'complex_input' | 'too_many_inputs' | 'bad_schema';
      detail: string;
    };

type Property = {
  type?: unknown;
  enum?: unknown;
  const?: unknown;
  title?: unknown;
  description?: unknown;
  default?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  exclusiveMinimum?: unknown;
  exclusiveMaximum?: unknown;
  maxLength?: unknown;
  format?: unknown;
  items?: unknown;
  minItems?: unknown;
  maxItems?: unknown;
  anyOf?: unknown;
  oneOf?: unknown;
};
const isValue = (v: unknown): v is NoahFormValue =>
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v));
const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** 「値か null」の形を、値の方だけにする。type が ['x','null']、anyOf / oneOf が [X, {type:'null'}]。それ以外の組み合わせは読まない。 */
function unwrap(raw: unknown): Property | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let p = raw as Property;
  for (const key of ['anyOf', 'oneOf'] as const) {
    const options = p[key];
    if (!Array.isArray(options)) continue;
    const rest = options.filter(
      (o) => !(o && typeof o === 'object' && (o as Property).type === 'null'),
    );
    if (rest.length !== 1 || !rest[0] || typeof rest[0] !== 'object')
      return null;
    // 外側の title・description・default を残す。
    p = {
      ...(rest[0] as Property),
      ...Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)),
    };
  }
  if (Array.isArray(p.type)) {
    const rest = p.type.filter((t) => t !== 'null');
    if (rest.length !== 1) return null;
    p = { ...p, type: rest[0] };
  }
  return p;
}

/** 項目 1 つを入力欄にする。'fixed' は const。null は入力欄にできない形。 */
function fieldOf(
  name: string,
  raw: unknown,
  required: boolean,
): NoahFormField | { fixed: NoahFormValue } | null {
  const p = unwrap(raw);
  if (!p) return null;
  if (p.const !== undefined)
    return isValue(p.const) ? { fixed: p.const } : null;
  const base = {
    name,
    required,
    label:
      text(p.title, NOAH_FORM_LIMITS.labelChars) ||
      name.slice(0, NOAH_FORM_LIMITS.labelChars),
    help: text(p.description, NOAH_FORM_LIMITS.helpChars),
  };
  if (Array.isArray(p.enum)) {
    const choices = p.enum.filter(isValue);
    if (
      !choices.length ||
      choices.length !== p.enum.filter((v) => v !== null).length
    )
      return null;
    // 選択肢が多すぎる時は、文字の欄にする（選べない値は、道具の定義の検査が拒否する）。実測の最大は 118 個。
    if (choices.length > NOAH_FORM_LIMITS.choices)
      return choices.every((c) => typeof c === 'string')
        ? { ...base, kind: 'text' }
        : null;
    return {
      ...base,
      kind: 'choice',
      choices,
      ...(isValue(p.default) && choices.includes(p.default)
        ? { default: p.default }
        : {}),
    };
  }
  if (p.type === 'string') {
    const format =
      p.format === 'date' ||
      p.format === 'date-time' ||
      p.format === 'email' ||
      p.format === 'uri'
        ? p.format
        : undefined;
    const maxLength = num(p.maxLength);
    return {
      ...base,
      kind: 'text',
      ...(maxLength !== undefined && maxLength >= 1
        ? { maxLength: Math.floor(maxLength) }
        : {}),
      ...(format ? { format } : {}),
      ...(typeof p.default === 'string'
        ? { default: p.default.slice(0, 2000) }
        : {}),
    };
  }
  if (p.type === 'integer' || p.type === 'number') {
    const integer = p.type === 'integer';
    // 整数の「より大きい」は、次の整数からにする。小数の「より大きい」は、相手の検査に任せる。
    const min =
      num(p.minimum) ??
      (integer && num(p.exclusiveMinimum) !== undefined
        ? Math.floor(num(p.exclusiveMinimum)!) + 1
        : undefined);
    const max =
      num(p.maximum) ??
      (integer && num(p.exclusiveMaximum) !== undefined
        ? Math.ceil(num(p.exclusiveMaximum)!) - 1
        : undefined);
    return {
      ...base,
      kind: 'number',
      ...(integer ? { integer: true as const } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(num(p.default) !== undefined ? { default: num(p.default)! } : {}),
    };
  }
  if (p.type === 'boolean')
    return {
      ...base,
      kind: 'boolean',
      ...(typeof p.default === 'boolean' ? { default: p.default } : {}),
    };
  if (p.type === 'array') {
    const item = unwrap(p.items);
    if (!item) return null;
    const limits = {
      ...(num(p.minItems) !== undefined && num(p.minItems)! >= 1
        ? { min: Math.floor(num(p.minItems)!) }
        : {}),
      max: Math.min(
        num(p.maxItems) !== undefined && num(p.maxItems)! >= 1
          ? Math.floor(num(p.maxItems)!)
          : NOAH_FORM_LIMITS.listItems,
        NOAH_FORM_LIMITS.listItems,
      ),
    };
    const preset =
      Array.isArray(p.default) && p.default.every(isValue)
        ? {
            default: (p.default as NoahFormValue[]).slice(
              0,
              NOAH_FORM_LIMITS.listItems,
            ),
          }
        : {};
    if (Array.isArray(item.enum)) {
      const choices = item.enum.filter(isValue);
      if (
        !choices.length ||
        choices.length > NOAH_FORM_LIMITS.choices ||
        choices.length !== item.enum.length
      )
        return null;
      return {
        ...base,
        kind: 'list',
        itemKind: typeof choices[0] === 'number' ? 'number' : 'text',
        choices,
        ...limits,
        ...preset,
      };
    }
    if (item.type === 'string')
      return { ...base, kind: 'list', itemKind: 'text', ...limits, ...preset };
    if (item.type === 'integer' || item.type === 'number')
      return {
        ...base,
        kind: 'list',
        itemKind: 'number',
        ...(item.type === 'integer' ? { integer: true as const } : {}),
        ...limits,
        ...preset,
      };
    return null;
  }
  return null;
}

/**
 * 道具 1 つの入力欄を作る。必須の入力が全部、文字・数・真偽・選択・それらの並びなら使える。
 * 入れ子の入力（object、object の並び、形の決まらない物）が必須の道具は、入力欄では使わない。
 * 任意の入力で入力欄にできない物は、出さずに数だけ返す。
 */
export function noahToolForm(
  tool: Pick<NoahToolDef, 'name' | 'inputSchema'>,
): NoahToolForm {
  const no = (
    reason: 'complex_input' | 'too_many_inputs' | 'bad_schema',
    detail: string,
  ): NoahToolForm => ({
    usable: false,
    tool: tool.name,
    reason,
    detail: detail.slice(0, 120),
  });
  const schema = (
    tool.inputSchema &&
    typeof tool.inputSchema === 'object' &&
    !Array.isArray(tool.inputSchema)
      ? tool.inputSchema
      : {}
  ) as {
    type?: unknown;
    properties?: unknown;
    required?: unknown;
  };
  if (schema.type !== undefined && schema.type !== 'object')
    return no('bad_schema', '入力の全体が object でない');
  const properties =
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required)
    ? [
        ...new Set(
          schema.required.filter(
            (key): key is string => typeof key === 'string',
          ),
        ),
      ]
    : [];
  for (const key of required)
    if (!Object.hasOwn(properties, key)) return no('bad_schema', key);
  if (required.length > NOAH_FORM_LIMITS.requiredFields)
    return no('too_many_inputs', String(required.length));

  const needed: NoahFormField[] = [];
  const optional: NoahFormField[] = [];
  const fixed: Record<string, NoahFormValue> = {};
  let omitted = 0;
  for (const [name, raw] of Object.entries(properties)) {
    const must = required.includes(name);
    const field = fieldOf(name, raw, must);
    if (!field) {
      if (must) return no('complex_input', name);
      omitted++;
    } else if ('fixed' in field) {
      if (must) fixed[name] = field.fixed; // 任意の const は、渡さなくても同じなので出さない
    } else (must ? needed : optional).push(field);
  }
  const room = Math.max(0, NOAH_FORM_LIMITS.fields - needed.length);
  omitted += Math.max(0, optional.length - room);
  return {
    usable: true,
    tool: tool.name,
    fields: [...needed, ...optional.slice(0, room)],
    fixed,
    omitted,
  };
}

export type NoahFormArgs =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; field: string; message: string };
/** 入っていない物として扱う値。空白だけの文字も、入っていない物とする。「いいえ」と 0 は、入っている。 */
const empty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);
/** 文字の数（JSON Schema の maxLength と同じ数え方。符号位置で数える）。 */
function codePoints(value: string): number {
  let count = 0;
  for (const _ of value) count++;
  return count;
}
const sameChoice = (choices: NoahFormValue[], v: unknown) =>
  choices.find(
    (c) => c === v || (typeof v === 'string' && String(c) === v.trim()),
  );
/** 数にする。全角の数字・小数点・負号は、半角にしてから読む（日本語の入力のまま打った数を受ける）。指数と桁区切りは受けない。 */
function toNumber(v: unknown, integer: boolean): number | null {
  const text =
    typeof v === 'string'
      ? v
          .trim()
          .normalize('NFKC')
          .replace(/^[\u2212\u30fc\uff70]/, '-')
      : '';
  const n =
    typeof v === 'number'
      ? v
      : /^-?\d+(\.\d+)?$/.test(text)
        ? Number(text)
        : NaN;
  return Number.isFinite(n) && (!integer || Number.isInteger(n)) ? n : null;
}

/**
 * 入力欄の値を、道具の引数へ直す。画面（その場の誤りの表示）とサーバー（正の検査）が、同じ関数を使う。
 * 画面から来た文字列も、すでに型の付いた値も受ける。入力欄に無い項目は、渡さずに拒否する。
 */
export function noahFormArgs(
  form: Extract<NoahToolForm, { usable: true }>,
  values: unknown,
): NoahFormArgs {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    return { ok: false, field: '', message: '入力の形が違います。' };
  const given = values as Record<string, unknown>;
  const names = new Set(form.fields.map((field) => field.name));
  for (const key of Object.keys(given))
    if (!names.has(key))
      return { ok: false, field: key, message: '入力欄に無い項目です。' };
  const args: Record<string, unknown> = {};
  for (const field of form.fields) {
    const raw = given[field.name];
    const bad = (message: string): NoahFormArgs => ({
      ok: false,
      field: field.name,
      message: `${field.label}${message}`,
    });
    if (empty(raw)) {
      if (field.required) return bad(' を入れてください。');
      continue;
    }
    if (field.kind === 'text') {
      if (typeof raw !== 'string') return bad(' は文字で入れてください。');
      if (field.maxLength !== undefined && codePoints(raw) > field.maxLength)
        return bad(` は ${field.maxLength} 文字までです。`);
      args[field.name] = raw;
    } else if (field.kind === 'number') {
      const n = toNumber(raw, field.integer === true);
      if (n === null)
        return bad(
          field.integer
            ? ' は整数で入れてください。'
            : ' は数で入れてください。',
        );
      if (field.min !== undefined && n < field.min)
        return bad(` は ${field.min} 以上にしてください。`);
      if (field.max !== undefined && n > field.max)
        return bad(` は ${field.max} 以下にしてください。`);
      args[field.name] = n;
    } else if (field.kind === 'boolean') {
      if (raw !== true && raw !== false && raw !== 'true' && raw !== 'false')
        return bad(' は、はい か いいえ で選んでください。');
      args[field.name] = raw === true || raw === 'true';
    } else if (field.kind === 'choice') {
      const choice = sameChoice(field.choices ?? [], raw);
      if (choice === undefined) return bad(' は、選択肢から選んでください。');
      args[field.name] = choice;
    } else {
      const items = (
        Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
            ? raw.split(/\r?\n/)
            : [raw]
      )
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter((item) => item !== '');
      if (!items.length) {
        if (field.required) return bad(' を入れてください。');
        continue;
      }
      if (field.max !== undefined && items.length > field.max)
        return bad(` は ${field.max} 件までです。`);
      if (field.min !== undefined && items.length < field.min)
        return bad(` は ${field.min} 件以上入れてください。`);
      const out: NoahFormValue[] = [];
      for (const item of items) {
        if (field.choices) {
          const choice = sameChoice(field.choices, item);
          if (choice === undefined)
            return bad(' は、選択肢から選んでください。');
          out.push(choice);
        } else if (field.itemKind === 'number') {
          const n = toNumber(item, field.integer === true);
          if (n === null) return bad(' は、1 行に 1 つの数で入れてください。');
          out.push(n);
        } else if (typeof item === 'string') out.push(item);
        else return bad(' は、1 行に 1 つの文字で入れてください。');
      }
      args[field.name] = out;
    }
  }
  for (const [name, value] of Object.entries(form.fixed)) args[name] = value;
  if (
    new TextEncoder().encode(JSON.stringify(args)).byteLength >
    NOAH_FORM_LIMITS.inputBytes
  )
    return {
      ok: false,
      field: '',
      message: '入力が長すぎます。短くしてください。',
    };
  return { ok: true, args };
}

/** 入力の形の最小の検査（道具の定義そのものに照らす）。object であること、必須の項目があること、型と選択肢が合うこと。 */
export function checkNoahToolArgs(
  schema: unknown,
  args: unknown,
): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args))
    return '入力は object です。';
  const s = (schema && typeof schema === 'object' ? schema : {}) as {
    required?: unknown;
    properties?: Record<string, { type?: unknown; enum?: unknown }>;
    additionalProperties?: unknown;
  };
  const given = args as Record<string, unknown>;
  for (const key of Array.isArray(s.required) ? s.required : [])
    if (!(String(key) in given)) return `必須の項目がありません: ${key}`;
  for (const [key, value] of Object.entries(given)) {
    const property = s.properties?.[key];
    if (!property) {
      if (s.additionalProperties === false) return `定義に無い項目です: ${key}`;
      continue;
    }
    const got = Array.isArray(value)
      ? 'array'
      : value === null
        ? 'null'
        : typeof value === 'number' && Number.isInteger(value)
          ? 'integer'
          : typeof value;
    const want = Array.isArray(property.type)
      ? property.type
      : typeof property.type === 'string'
        ? [property.type]
        : [];
    if (
      want.length &&
      !want.includes(got) &&
      !(got === 'integer' && want.includes('number'))
    )
      return `型が違います: ${key}`;
    if (Array.isArray(property.enum) && !property.enum.includes(value))
      return `選べない値です: ${key}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 道具の一覧（選ぶ画面）と、確かめの記録
// ---------------------------------------------------------------------------

/** 道具 1 つの定義の hash。本人が見た定義と、呼ぶ時の定義が同じかを確かめるのに使う。 */
export function noahToolSha256(tool: NoahToolDef): Promise<string> {
  return sha256Hex(
    canonicalJson({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      readOnly: tool.readOnly,
    }),
  );
}

/** 本人が確かめた、読み取りだけでない道具。名前と、その時の定義の hash の組。定義が変わったら、確かめ直す。 */
export type NoahConfirmedTool = { name: string; sha256: string };
export type NoahToolMenuItem = {
  name: string;
  /** 説明の先頭（提供者の文のまま）。 */
  summary: string;
  readOnly: boolean;
  sha256: string;
  usable: boolean;
  reason?: 'complex_input' | 'too_many_inputs' | 'bad_schema';
  /** 必須の入力欄の数。0 なら、押すだけで頼める。 */
  required: number;
  /** 読み取りだけと宣言されていず、この定義を本人がまだ確かめていない。最初の 1 回、送る前に確かめる。 */
  needsConfirm: boolean;
};

/**
 * 道具を選ぶ画面の並び。入力欄で使える物を先に、その中は提供者が並べた順のまま。
 * 読み取りだけの宣言で並べ替えない（提供者の順には、主な道具が先という意味があることが多い）。印で見分ける。
 */
export async function noahToolMenu(
  tools: NoahToolDef[],
  confirmed: NoahConfirmedTool[],
): Promise<NoahToolMenuItem[]> {
  const items: NoahToolMenuItem[] = [];
  for (const tool of tools) {
    const form = noahToolForm(tool);
    const sha256 = await noahToolSha256(tool);
    items.push({
      name: tool.name,
      summary: text(tool.description, NOAH_FORM_LIMITS.summaryChars),
      readOnly: tool.readOnly,
      sha256,
      usable: form.usable,
      ...(form.usable ? {} : { reason: form.reason }),
      required: form.usable
        ? form.fields.filter((field) => field.required).length
        : 0,
      needsConfirm:
        !tool.readOnly &&
        !confirmed.some((c) => c.name === tool.name && c.sha256 === sha256),
    });
  }
  return [
    ...items.filter((item) => item.usable),
    ...items.filter((item) => !item.usable),
  ];
}

/** 握手 1 回から、一覧に載せる時に使う数（道具の定義そのものは保存しない）。 */
export function noahFormSummary(tools: NoahToolDef[]): {
  formTools: number;
  oneTapTools: number;
} {
  let formTools = 0;
  let oneTapTools = 0;
  for (const tool of tools) {
    const form = noahToolForm(tool);
    if (!form.usable) continue;
    formTools++;
    if (tool.readOnly && !form.fields.some((field) => field.required))
      oneTapTools++;
  }
  return { formTools, oneTapTools };
}

/** 同じ操作 ID の再送で、内容が変わっていないかを確かめる hash。 */
export function noahFormRequestSha256(input: {
  connectionId: string;
  tool: string;
  toolSha256: string;
  args: Record<string, unknown>;
}): Promise<string> {
  return sha256Hex(
    canonicalJson([
      'form',
      input.connectionId,
      input.tool,
      input.toolSha256,
      input.args,
    ]),
  );
}

// ---------------------------------------------------------------------------
// 結果を文字にする
// ---------------------------------------------------------------------------

const ATTACHMENT: Record<string, string> = {
  image: '画像',
  audio: '音声',
  resource: 'ファイル',
  resource_link: 'ファイル',
};
/** UTF-8 の大きさで切る。文字の途中で切らない。 */
function clip(
  value: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maxBytes)
    return { text: value, truncated: false };
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (encoder.encode(value.slice(0, middle)).byteLength <= maxBytes)
      low = middle;
    else high = middle - 1;
  }
  // サロゲートの片方で終わらないようにする。
  const end =
    low > 0 &&
    value.charCodeAt(low - 1) >= 0xd800 &&
    value.charCodeAt(low - 1) <= 0xdbff
      ? low - 1
      : low;
  return { text: value.slice(0, end), truncated: true };
}

/**
 * 道具の結果を、成果の文にする。文字の部分をつなぎ、画像などは件数だけを書く（保存は後の task）。
 * 文字の部分が無く、構造のある結果だけの時は、その JSON を整えて出す。HTML としては解釈しない。
 */
export function noahResultText(
  result: { content: unknown; blocks?: unknown[] },
  maxBytes: number = NOAH_FORM_LIMITS.resultBytes,
): { text: string; truncated: boolean; attachments: number } {
  const blocks = Array.isArray(result.blocks)
    ? result.blocks
    : Array.isArray(result.content)
      ? result.content
      : [];
  const texts: string[] = [];
  const others = new Map<string, number>();
  for (const block of blocks as { type?: unknown; text?: unknown }[]) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      if (block.text.trim()) texts.push(block.text.trim());
    } else if (block && typeof block === 'object') {
      const label = ATTACHMENT[String(block.type)] ?? 'ファイル';
      others.set(label, (others.get(label) ?? 0) + 1);
    }
  }
  let body = texts.join('\n\n');
  if (
    !body &&
    result.content !== null &&
    result.content !== undefined &&
    !Array.isArray(result.content)
  ) {
    body =
      typeof result.content === 'string'
        ? result.content.trim()
        : JSON.stringify(result.content, null, 2);
  }
  const notes = [...others].map(([label, count]) => `（${label} ${count} 件）`);
  const attachments = [...others.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  if (!body && !notes.length) body = '（結果は空でした）';
  const suffix = '\n（長いので切りました）';
  const joined = [body, ...notes].filter(Boolean).join('\n');
  const clipped = clip(
    joined,
    maxBytes - new TextEncoder().encode(suffix).byteLength,
  );
  return {
    text: clipped.truncated ? clipped.text + suffix : clipped.text,
    truncated: clipped.truncated,
    attachments,
  };
}

export type NoahOutlineRow = { depth: number; label: string; text: string };
/**
 * 成果の文の全体が JSON の object か配列の時、項目ごとの行にして読みやすく出す。そうでなければ null（文のまま出す）。
 * 値を作り変えない。並びも変えない。画面は「元の形で見る」で、文のままも出せるようにする。
 */
export function noahResultOutline(
  value: string,
  limits: { rows: number; depth: number } = {
    rows: NOAH_FORM_LIMITS.outlineRows,
    depth: NOAH_FORM_LIMITS.outlineDepth,
  },
): NoahOutlineRow[] | null {
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const rows: NoahOutlineRow[] = [];
  let skipped = 0;
  const leaf = (v: unknown) =>
    typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : '';
  const walk = (node: unknown, depth: number) => {
    const entries: [string, unknown][] = Array.isArray(node)
      ? node.map((item, index) => [String(index + 1), item])
      : Object.entries(node as Record<string, unknown>);
    for (const [label, item] of entries) {
      if (rows.length >= limits.rows) {
        skipped++;
        continue;
      }
      if (item && typeof item === 'object') {
        if (depth + 1 >= limits.depth)
          rows.push({ depth, label, text: JSON.stringify(item).slice(0, 200) });
        else {
          rows.push({ depth, label, text: '' });
          walk(item, depth + 1);
        }
      } else rows.push({ depth, label, text: leaf(item) });
    }
  };
  walk(parsed, 0);
  if (skipped)
    rows.push({ depth: 0, label: '', text: `（ほか ${skipped} 件）` });
  return rows;
}

// ---------------------------------------------------------------------------
// つなぐ前・頼む前の上限（1 人が続けて使いすぎない。1 つの接続先へ、Noah の利用者が集まりすぎない）
// 数え方の SQL は docs/contracts/noah-listing-v1.sql（gate・connect_gate・host_take）。
// ---------------------------------------------------------------------------

/**
 * 数値は候補。本人が変える（環境変数 NOAH_ASK_LIMITS の JSON で、項目ごとに上書きできる）。
 * open〜hostPerMinute は依頼。connect* は接続。hostHandshakes は、1 つの接続先へ、利用者の操作から始める握手
 * （接続・道具の一覧・依頼）を、全員合わせて 60 秒の枠に何回まで行うか（host_take の :limit）。
 */
import { NOAH_ASK_LIMITS } from './noah-limits.ts';
export { NOAH_ASK_LIMITS };
/** 接続先の枠（host_take）が取れなかった時の文。相手が「混んでいる」と返して待っている間も、同じ文を出す。 */
export const NOAH_HOST_BUSY =
  'この Agent は、今こんでいます。少し待ってから試してください。';

export type NoahAskGate =
  | { ok: true }
  | {
      ok: false;
      status: 409 | 429;
      code: 'open' | 'minute' | 'day' | 'host';
      message: string;
    };
/**
 * 頼む前の検査。数は呼ぶ側が数えて渡す（本人の終わっていない依頼、本人の直近 60 秒、本人の直近 24 時間、接続先の直近 60 秒）。
 * 「1 日」は、時刻の帯に依らないように、直近 24 時間で数える。上から順に見て、最初に越えた物を返す。
 */
export function noahAskGate(
  counts: {
    open: number;
    lastMinute: number;
    lastDay: number;
    hostLastMinute: number;
  },
  limits: Pick<
    typeof NOAH_ASK_LIMITS,
    'open' | 'perMinute' | 'perDay' | 'hostPerMinute'
  > = NOAH_ASK_LIMITS,
): NoahAskGate {
  if (counts.open >= limits.open)
    return {
      ok: false,
      status: 409,
      code: 'open',
      message: '進んでいる依頼が多すぎます。終わるまで待ってください。',
    };
  if (counts.lastMinute >= limits.perMinute)
    return {
      ok: false,
      status: 429,
      code: 'minute',
      message: '続けて頼みすぎています。少し待ってから試してください。',
    };
  if (counts.lastDay >= limits.perDay)
    return {
      ok: false,
      status: 429,
      code: 'day',
      message:
        'この 24 時間の回数を使い切りました。時間をおいて、また使えます。',
    };
  if (counts.hostLastMinute >= limits.hostPerMinute)
    return { ok: false, status: 429, code: 'host', message: NOAH_HOST_BUSY };
  return { ok: true };
}

export type NoahConnectGate =
  | { ok: true }
  | {
      ok: false;
      status: 409 | 429;
      code: 'live' | 'minute' | 'day';
      message: string;
    };
/**
 * つなぐ前の検査。新しく接続の行を作る時だけ行う（同じ操作の再送と、もうつながっている物は数えない）。
 * 数は呼ぶ側が数えて渡す（本人の、切っていない接続・直近 60 秒に作った接続・直近 24 時間に作った接続）。
 * 切ってつなぎ直す事を繰り返して、相手のサーバーへ握手を送り続ける使い方を止める。
 */
export function noahConnectGate(
  counts: { live: number; lastMinute: number; lastDay: number },
  limits: Pick<
    typeof NOAH_ASK_LIMITS,
    'connectLive' | 'connectPerMinute' | 'connectPerDay'
  > = NOAH_ASK_LIMITS,
): NoahConnectGate {
  if (counts.live >= limits.connectLive)
    return {
      ok: false,
      status: 409,
      code: 'live',
      message:
        'つながっているものが多すぎます。使っていないものを切ってください。',
    };
  if (counts.lastMinute >= limits.connectPerMinute)
    return {
      ok: false,
      status: 429,
      code: 'minute',
      message: '続けてつなぎすぎています。少し待ってから試してください。',
    };
  if (counts.lastDay >= limits.connectPerDay)
    return {
      ok: false,
      status: 429,
      code: 'day',
      message:
        'この 24 時間につなげる数を使い切りました。時間をおいて、また使えます。',
    };
  return { ok: true };
}
