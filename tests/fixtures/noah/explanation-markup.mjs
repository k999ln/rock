import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { noahAgentExplanation } from '../../../lib/noah-agent-explanation.ts';
import { planNoahConnection } from '../../../lib/noah-connect-plan.ts';
import { noahLaunchPlanState } from '../../../lib/noah-connect-source.ts';
import { noahTranslate } from '../../../lib/noah-i18n.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const cleanse = { name: 'clean_csv', consumes: ['csv'], produces: 'cleaned-csv' };
const check = { name: 'check_csv', consumes: ['cleaned-csv'], produces: 'checked-csv' };
const summarize = { name: 'summarize_notes', consumes: ['notes'], produces: 'summary' };

// Synthetic contracts used to test the interface. They make no catalog or provider claims.
export const NOAH_EXPLANATION_FIXTURES = {
  single: { name: 'メモの要約', summary: 'メモから要点を作ります。', tools: [summarize], signedIn: false, secrets: [] },
  chain: { name: 'CSV の整理と確認', summary: 'CSV を整えて検査し、メモは並行して要約します。', tools: [check, cleanse, summarize], signedIn: true, secrets: [] },
  key: { name: '鍵付きの CSV 検査', summary: '認証が必要なツールで、整えた CSV を検査します。', tools: [check], signedIn: true, secrets: ['API_KEY'] },
};

export async function renderNoahExplanationFixture(sample, { locale = 'ja', noLabels = false, explanation } = {}) {
  const { name, summary, tools, signedIn, secrets } = NOAH_EXPLANATION_FIXTURES[sample];
  const req = { surface: 'none', places: ['provider'], services: [], secrets, model: { use: 'none' } };
  const state = noahLaunchPlanState({ signedIn, connectSha256: 'a'.repeat(64), level: 1, consentedSha256: null });
  const plan = planNoahConnection(req, state);
  const id = `mcp-registry:fixture/${sample}`;
  const detail = {
    id, name, summary, provider: 'UI fixture', host: 'agent.example.test', tools: tools.length, listed: true,
    connect: { badge: plan.badge, price: { model: 'free' } }, ownerScope: signedIn ? 'test-owner' : null, connection: null,
    ...(noLabels ? {} : { explanation: explanation ?? noahAgentExplanation(tools, plan.steps) }),
  };

  const omitted = new Set([
    'noah-agent-visual', 'noah-agent-share', 'noah-loading', 'noah-registration-sheet', 'noah-ask',
    'noah-work-list', 'noah-trial-report', 'noah-pin-extras', 'noah-shelf-opened', 'noah-trial-entry',
  ]);
  const cssKeys = new Proxy({}, { get: (_, key) => String(key) });
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    let detailStateCalls = 0;
    const deps = (imported) => {
      if (imported.endsWith('.module.css')) return { default: cssKeys };
      if (imported === 'next/link') return { default: 'a' };
      if (imported === './noah-locale') return { useNoahLocale: () => ({ locale, t: (text, values) => noahTranslate(locale, text, values) }) };
      if (imported === '@/lib/noah-agent-share-server') return { publicNoahShareAgent: async () => null };
      if (omitted.has(imported.split('/').at(-1))) return { default: () => null };
      if (imported === 'react' && file.endsWith('/noah-ready-detail.tsx')) return { ...React, useState(initial) {
        // SSR starts from the completed detail fetch; the actual UI loads it after mount.
        return React.useState(detailStateCalls++ === 0 ? { attempt: 0, loaded: { state: 'ready', detail } } : initial);
      } };
      if (!imported.startsWith('.') && !imported.startsWith('@/')) return require(imported);
      const path = imported.startsWith('@/') ? resolve(root, imported.slice(2)) : resolve(dirname(file), imported);
      return existsSync(`${path}.tsx`) ? load(`${path}.tsx`) : require(existsSync(`${path}.ts`) ? `${path}.ts` : path);
    };
    runInNewContext(source, { exports, require: deps, URL, URLSearchParams, Intl });
    modules.set(file, exports);
    return exports;
  }
  const { default: page } = load(resolve(root, 'app/noah/ready/agent/page.tsx'));
  const markup = await page({ searchParams: Promise.resolve({ id }) });
  return renderToStaticMarkup(markup);
}

export function noahExplanationFixtureCss() {
  return ['noah-service.module.css', 'noah-ready.module.css', 'noah-blueprint-levels.module.css']
    .map((name) => readFileSync(resolve(root, 'components', name), 'utf8')).join('\n');
}
