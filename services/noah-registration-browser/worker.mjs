import puppeteer from '@cloudflare/puppeteer';
import { SESSION_MS, authenticate, boundedJson, json, recipes, validEnvelope, validInput, validValues } from './protocol.mjs';

const fixture = { id: 'fixture', revision: 1, domains: [], fields: [{ key: 'name', selector: '#name', required: true }], submit: '#start' };
const worker = {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/health' && request.method === 'GET') return json({ service: 'noah-registration-browser', version: 1 });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/session') return json({ error: 'not_found' }, 404);
    try {
      const body = await boundedJson(request);
      if (!await authenticate(env.NOAH_BROWSER_KEY, request, JSON.stringify(body))) return json({ error: 'unauthorized' }, 401);
      if (!validEnvelope(body)) return json({ error: 'invalid_request' }, 400);
      const recipe = body.providerId === 'fixture' ? fixture : recipes(env.NOAH_BROWSER_RECIPES).find(r => r.id === body.providerId);
      if (!recipe || (body.action === 'register' && (body.revision !== recipe.revision || !validValues(recipe, body.values)))) return json({ error: 'unavailable_provider' }, 400);
      const session = env.SESSIONS.get(env.SESSIONS.idFromName(`${body.owner}:${body.id}`));
      return session.fetch(new Request('https://session.invalid', { method: 'POST', body: JSON.stringify({ ...body, recipe }) }));
    } catch { return json({ error: 'unavailable' }, 503); }
  }
};

export default worker;

/** Small initial rollout: reserve at most ten browser minutes per UTC day. No paid upgrade. */
export class BrowserBudget {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const { id } = await request.json(), day = new Date().toISOString().slice(0, 10);
    return this.ctx.storage.transaction(async tx => {
      const record = await tx.get('budget') ?? { day, ids: [], last: 0 };
      if (record.day !== day) Object.assign(record, { day, ids: [], last: 0 });
      if (record.ids.includes(id)) return json({ accepted: false }, 409);
      const duration=Math.min(SESSION_MS,600_000-record.ids.length*SESSION_MS);
      if (duration<=0 || Date.now() - record.last < 21_000) return json({ accepted: false }, 429);
      record.ids.push(id); record.last = Date.now(); await tx.put('budget', record);
      return json({ accepted: true,duration });
    });
  }
}

export class RegistrationSession {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.chain = Promise.resolve(); }
  fetch(request) {
    // Serialize network work as well as storage writes: duplicate taps cannot race a form submit.
    const run = this.chain.then(() => this.handle(request)); this.chain = run.catch(() => {}); return run;
  }
  async connect(record) {
    const browser = await puppeteer.connect(this.env.BROWSER, record.session);
    const pages = await browser.pages(); const page = pages[0];
    if (!page) { await browser.disconnect(); throw Error('missing_page'); }
    // connect() currently resets to 800×600 even when defaultViewport is supplied.
    await page.setViewport({ width: 390, height: 640, deviceScaleFactor: 1 });
    for (const other of pages) if (other !== page) await other.close();
    return { browser, page };
  }
  async close(record) {
    if (!record?.session) return;
    try { const browser = await puppeteer.connect(this.env.BROWSER, record.session); await browser.close(); } catch { /* expiry also closes the remote browser */ }
  }
  async alarm() {
    const record = await this.ctx.storage.get('record'); await this.close(record);
    if (record) await this.ctx.storage.put('record', { ...record, session: null, state: 'unknown' });
  }
  async handle(request) {
    const input = await request.json(); const { recipe } = input;
    let record = await this.ctx.storage.get('record'); let browser;
    const present = () => ({ id: input.id, state: record.state, expiresAt: record.expiresAt, sequence: record.sequence ?? 0 });
    try {
      if (record && (record.providerId !== input.providerId || record.revision !== recipe.revision || record.owner !== input.owner)) return json({ error: 'session_mismatch' }, 409);
      if (input.action === 'register') {
        if (record) return json(present());
        const permit = await this.env.BUDGET.get(this.env.BUDGET.idFromName('global')).fetch(new Request('https://budget.invalid', { method: 'POST', body: JSON.stringify({ id: `${input.owner}:${input.id}` }) }));
        if (!permit.ok) return json({ error: 'capacity' }, 429);
        const {duration}=await permit.json();
        // Persist the claim before launch. A lost response never causes another submission.
        record = { id: input.id, owner: input.owner, providerId: recipe.id, revision: recipe.revision, state: 'unknown', sequence: 0, expiresAt: Date.now() + duration, session: null };
        await this.ctx.storage.put('record', record); await this.ctx.storage.setAlarm(record.expiresAt);
        browser = await puppeteer.launch(this.env.BROWSER, { keep_alive: duration, guardrails: { allowedDomains: recipe.domains } });
        const page = await browser.newPage(); await page.setViewport({ width: 390, height: 640, deviceScaleFactor: 1 });
        for (const other of await browser.pages()) if (other !== page) await other.close();
        record.session = browser.sessionId();
        await this.ctx.storage.put('record', record);
        if (recipe.id === 'fixture') await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><style>body{font:18px sans-serif;padding:24px;color:#222}input,button{font:inherit;padding:12px;margin:12px 0;max-width:280px}button{background:#6f42c1;color:white;border:0;border-radius:10px}</style><h1>Noah 登録テスト</h1><p>外部サービスには登録しません。</p><input id="name" aria-label="名前"><button id="start" onclick="this.hidden=true;document.getElementById(\'confirm\').hidden=false">登録を進める</button><button id="confirm" hidden onclick="this.textContent=\'確認しました\';this.dataset.done=\'yes\'">本人確認を完了</button>');
        else await page.goto(recipe.startUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        for (const field of recipe.fields) { await page.waitForSelector(field.selector, { timeout: 5000 }); await page.$eval(field.selector, (element, value) => { if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw Error('field'); Object.getOwnPropertyDescriptor(element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, input.values[field.key]); }
        await page.click(recipe.submit); record.state = 'needs_user'; await this.ctx.storage.put('record', record);
        return json(present());
      }
      if (!record) return json({ error: 'not_found' }, 404);
      if (record.expiresAt <= Date.now()) { await this.close(record); record.state = 'unknown'; record.session = null; await this.ctx.storage.put('record', record); return json(present(), 410); }
      if (input.action === 'cancel') { await this.close(record); if(record.state!=='completed')record.state = 'failed'; record.session = null; await this.ctx.storage.put('record', record); await this.ctx.storage.deleteAlarm(); return json(present()); }
      if (input.action === 'status') return json(present());
      if (record.state !== 'needs_user' || !record.session) return json(present(), 409);
      const attached = await this.connect(record); browser = attached.browser; const page = attached.page;
      if (recipe.id !== 'fixture' && !recipe.domains.includes(new URL(page.url()).hostname)) throw Error('unexpected_origin');
      if (input.action === 'input') {
        if (!validInput(input.input)) return json({ error: 'invalid_input' }, 400);
        if (input.input.sequence !== record.sequence + 1) return json(present(), 409);
        record.sequence++; await this.ctx.storage.put('record', record);
        const control = input.input;
        if (control.kind === 'click') await page.mouse.click(control.x, control.y);
        if (control.kind === 'text') await page.keyboard.sendCharacter(control.text);
        if (control.kind === 'key') await page.keyboard.press(control.key);
        if (control.kind === 'scroll') await page.mouse.wheel({ deltaY: control.delta });
        return json(present());
      }
      if (input.action === 'frame') return json({ ...present(), image: await page.screenshot({ type: 'jpeg', quality: 60, encoding: 'base64' }), width: 390, height: 640 });
      if (input.action === 'resume') {
        if (recipe.id === 'fixture') {
          if (!await page.$('#confirm[data-done="yes"]')) return json(present());
          record.state = 'completed'; await browser.close(); browser = null; record.session = null;
          await this.ctx.storage.put('record', record); await this.ctx.storage.deleteAlarm(); return json({ ...present(), fixture: true });
        }
        const credential = await page.$eval(recipe.credentialSelector, element => 'value' in element ? element.value : element.textContent).catch(() => null);
        if (typeof credential !== 'string' || !credential || credential.length > 2048 || /\s/.test(credential) || Array.from(credential).some(c => c.charCodeAt(0) < 32)) return json(present());
        const response = await fetch(recipe.verifyUrl, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${credential}` } });
        if (!response.ok) { await response.body?.cancel(); return json(present()); }
        const verified = await boundedJson(response, 16_384), externalId = verified[recipe.identityField];
        if (typeof externalId !== 'string' || !externalId || externalId.length > 160) return json(present());
        // Only the authenticated Noah server receives this. Persist encrypted there before cancelling.
        return json({ ...present(), verified: { credential, externalId } });
      }
      return json({ error: 'invalid_action' }, 400);
    } catch { return json({ id: input.id, state: 'unknown' }, 503); }
    finally { if (browser) await browser.disconnect().catch(() => {}); }
  }
}
