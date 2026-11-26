import test from 'node:test';
import assert from 'node:assert/strict';
import * as noahSurface from '../lib/noah-surface.ts';
import * as cloudContract from '../lib/noah-cloud-contract.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import { createNoahProjectApi } from '../lib/noah-project-api.ts';
import { noahFirstJobs } from '../lib/noah-first-jobs.ts';
import * as theaterFilms from '../lib/noah-theater-films.ts';
import * as trainingPlugin from '../lib/noah-training-plugin.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { screen } from './fixtures/noah/screen.mjs';
import { siteTool } from '../toolkits/noah-affiliate-agents/site-diagnostics.mjs';
import { NOAH_LOCALES, noahTranslate } from '../lib/noah-i18n.ts';

function feedScreen(options) {
  const observers = new Set();
  const ui = screen({...options,
    hostElement:(type,props)=>props['data-noah-feed-end']!==undefined ? {end:true} : options.hostElement?.(type,props),
    IntersectionObserver:class {
      constructor(callback){this.callback=callback;}
      observe(target){if(target.end)observers.add(this);}
      disconnect(){observers.delete(this);}
    },
  });
  ui.advance=async home=>{for(const observer of observers)observer.callback([{isIntersecting:true}]);await home.flush();};
  return ui;
}

const project = 'project-' + 'a'.repeat(64);
const choices = (await noahFirstJobs([], false)).map(job => ({
  ...job, href: `/noah/discover/agent?id=${project}&firstJob=${job.id}`,
}));
const quiet = { default: () => null };
const sharedModules = {
  './noah-timeline': quiet, './noah-pin-grid': quiet, './noah-work-list': quiet,
  '@/lib/owner-intent': ownerIntent, '@/lib/noah-cloud-contract': cloudContract,
  '@/lib/noah-theater-films': theaterFilms,
  '@/lib/noah-training-plugin': trainingPlugin,
};
const modules = { ...sharedModules, './noah-ready-detail': quiet };
const pageReply = firstJobs => ({ items: [], total: 0, nextCursor: null, ownerScope: null, firstJobs });
const detail = (ui, firstJob) => ui.mount('components/noah-project-detail.tsx', { id: project, firstJob });

void test('the public home has one collection and available task links inside their matching card', async () => {
  const realModules = { ...modules }; delete realModules['./noah-pin-grid'];
  const items = [{id:'family-memory',feedbackId:project,name:'Memory',topic:'data',external:false,savedIn:[],shape:1}];
  const ui = feedScreen({modules:realModules, fetch:async()=>({body:{...pageReply(choices.slice(1)),items,total:1}})});
  const home = ui.mount('components/noah-home.tsx',{mode:'public'}); await home.flush();
  const grids=home.find('ul').filter(node=>node.props['data-agent-pin-grid']);
  assert.equal(grids.length,1);
  assert.equal(home.find('h1','Agentを見つける').length,1);
  assert.doesNotMatch(home.text(),/Today|注目のAgent|何をしたいですか|フォロー中/);
  assert.equal(home.find('section').length,1);
  const card=home.find('li').find(node=>node.props['data-agent-pin-id']==='family-memory');
  for(const job of choices.slice(1)) {
    const link=home.find('a',job.title)[0];
    assert.equal(link.props.href,job.href); assert.ok(home.nodes(card).includes(link));
  }
  assert.equal(home.find('a',choices[0].title).length,0);
  assert.equal(home.find('a','専用クラウドを開く')[0].props.href,'/api/noah/cloud-work');
  assert.equal(ui.calls.length,1); assert.equal(ui.calls[0].method,'GET');
});

void test('catalog cards appear once with or without an available featured job', async () => {
  const realModules = { ...modules }; delete realModules['./noah-pin-grid'];
  const items=['a','b','c','d','e','f'].map(key=>({id:'project-'+key.repeat(64),name:'Agent '+key,topic:'dev',external:true,savedIn:[]}));
  for(const jobs of [[choices.find(job=>job.id==='memory')],[]]) {
    const ui=feedScreen({modules:realModules,fetch:async()=>({body:{...pageReply(jobs),items,total:items.length}})});
    const home=ui.mount('components/noah-home.tsx',{mode:'public'});await home.flush();
    assert.deepEqual(home.find('li').filter(node=>node.props['data-agent-pin-id']).map(node=>node.props['data-agent-pin-id']),items.map(item=>item.id));
    assert.equal(home.find('ul').filter(node=>node.props['data-agent-pin-grid']).length,1);
    assert.ok(ui.calls.every(call=>call.url.startsWith('/api/noah/discover?')));
  }
});

void test('every page of catalog results uses pins and keeps the catalog actions separate', async () => {
  const items = Array.from({ length: 7 }, (_, index) => ({
    id: 'catalog-' + index, name: 'Agent ' + index, topic: 'work', shape: index % 3,
    summary: 'Agent purpose', provider: 'Test provider', external: index > 0,
    href: '/noah/ready/agent?id=local', savedIn: [],
  }));
  const ui = feedScreen({ fetch: async ({ url }) => {
    const next = new URL(url, 'https://avoado.si').searchParams.get('cursor') === '6';
    return { body: { items: next ? items.slice(6) : items.slice(0, 6), nextCursor: next ? null : '6', total: 7, ownerScope: 'test-owner' } };
  } });
  const home = ui.mount('components/noah-pin-home.tsx', {});
  await home.flush();
  const pins = () => home.find('li').filter(node => node.props['data-agent-pin-id']);
  assert.deepEqual(pins().map(row => row.props['data-agent-pin-id']), items.slice(0, 6).map(item => item.id));
  await ui.advance(home);
  await home.flush();
  assert.deepEqual(pins().map(row => row.props['data-shape']), items.map(item => item.shape));
  const nodes = home.nodes(pins()[0]);
  const face = nodes.find(node => node.type === 'a');
  assert.equal(face.props.href, items[0].href);
  assert.equal(home.nodes(face).some(node => node.type === 'button'), false);
  assert.equal(nodes.some(node => node.props?.['aria-label'] === 'Agent 0を保存'), true);
  assert.equal(nodes.some(node => node.props?.['aria-label'] === 'その他の操作'), true);
  const last = home.nodes(pins().at(-1));
  assert.equal(last.find(node => node.type === 'a').props.href, '/noah/discover/agent?id=catalog-6');
  assert.equal(last.some(node => node.type === 'button'), false);
});

void test('only available matching tasks are passed to the shared grid without a separate purpose section', async () => {
  const memory=choices.find(job=>job.id==='memory');
  let passed;
  const ui=feedScreen({modules:{...modules,'./noah-pin-grid':{default:props=>{passed=props.jobs;return null;}}},fetch:async()=>({body:pageReply([memory,{...choices[0],href:null}])})});
  const home=ui.mount('components/noah-home.tsx',{mode:'public'});await home.flush();
  assert.deepEqual(passed,[memory]);
  assert.equal(home.find('h3').length,0);
  assert.ok(home.find('span').some(node=>node.props.id==='first-jobs'&&node.props.tabIndex===-1));
});

void test('all unavailable and a failed lookup both preserve exploration and saved results; the local home does not request choices', async () => {
  for (const state of ['unavailable', 'error', 'local']) {
    const ui = feedScreen({ modules, fetch: async () => state === 'error' ? { status: 503, body: { error: 'offline' } } : { body: pageReply(choices.map(job => ({ ...job, href: null }))) } });
    const home = ui.mount('components/noah-home.tsx', { mode: state === 'local' ? 'local' : 'public' });
    await home.flush();
    assert.equal(ui.calls[0].url.includes('firstJobs'), state !== 'local');
    assert.equal(home.find('section').length,1);
    assert.equal(home.find('h1','Agentを見つける').length,1);
    if(state==='error') { assert.match(home.text(),/offline/); assert.equal(home.find('button','再試行').length,1); }
    else assert.match(home.text(),/この条件のAgentはまだありません/);
  }
});

void test('loading the next page of cards preserves the selected task links without another availability lookup', async () => {
  let passed;
  const ui = feedScreen({ modules:{...modules,'./noah-pin-grid':{default:props=>{passed=props.jobs;return null;}}}, fetch: async ({url}) => {
    const params = new URL(url, 'https://noah.test').searchParams;
    return params.get('cursor') === '0'
      ? { body: { ...pageReply(choices), nextCursor: '20' } }
      : { body: pageReply(undefined) };
  } });
  const home = ui.mount('components/noah-home.tsx', { mode: 'public' });
  await home.flush();
  await ui.advance(home);
  assert.equal(ui.calls.length, 2);
  assert.ok(!ui.calls[1].url.includes('firstJobs'));
  assert.deepEqual(passed, choices);
});

void test('hiding a card reached on a later page also removes its matching task from the home', async () => {
  const otherId = 'project-' + 'b'.repeat(64), retained = { ...choices[1], href: choices[1].href.replace(project, otherId) };
  let passed;
  const ui = feedScreen({ modules: { ...modules, './noah-pin-grid': { default: ({items, onHide,jobs}) => {passed=jobs;return items.map(item => ({
    type: 'button', props: { children: 'Hide ' + item.id, onClick: () => onHide(item.id) },
  }));} } }, fetch: async ({url, method, body}) => {
    if (method === 'POST') { assert.equal(body.familyId, 'family-hidden'); return { body: {} }; }
    const cursor = new URL(url, 'https://noah.test').searchParams.get('cursor');
    return cursor === '0' ? { body: { ...pageReply([choices[0], retained]), nextCursor: '20' } }
      : { body: { ...pageReply(undefined), items: [{ id: 'family-hidden', feedbackId: project }] } };
  } });
  const home = ui.mount('components/noah-home.tsx', { mode: 'public' });
  await home.flush(); await ui.advance(home); await home.click('Hide family-hidden');
  assert.equal(home.find('a', choices[0].title).length, 0);
  assert.deepEqual(passed,[retained]);
});

for (const job of choices.filter(job => job.operation)) {
  void test(`${job.id} opens only the matching operation and goes to the owned result after explicit submission`, async () => {
    const requests = [], id = 'work-123';
    const ui = feedScreen({ modules, fetch: async request => {
      const url = new URL(request.url, 'https://noah.test');
      if (url.pathname === '/api/noah/discover/project') {
        assert.equal(url.searchParams.get('firstJob'), job.id);
        return { body: { card: {}, connection: { kind: 'setup', importHref: null }, firstJob: job } };
      }
      assert.equal(url.pathname, '/api/noah/provider');
      if (request.method === 'GET') return { body: { ownerScope: 'owner', plan: { host: 'https://provider.example', endpoints: [
        { name: 'unrelated', fields: [] },
        { name: job.operation, digest: 'verified', fields: [{ name: 'url', kind: 'text', label: '公開サイトのURL', optional: false }] },
      ] } } };
      requests.push(request);
      return { body: { id, ownerScope: 'owner' } };
    } });
    const page = detail(ui, job.id);
    await page.flush();
    assert.equal(page.text(page.find('h1')[0]), job.title);
    assert.ok(page.text().includes(job.input) && page.text().includes(job.output));
    assert.equal(page.find('a', '目的を選び直す')[0].props.href, '/noah#first-jobs');
    assert.equal(page.find('a', '保存した成果を見る')[0].props.href, '/noah/saved?tab=results');
    assert.equal(page.find('form').length, 0);
    await page.click('診断の入力欄を開く');
    assert.equal(page.find('select').length, 0);
    assert.ok(!page.text().includes('unrelated'));
    assert.equal(requests.length, 0);
    await page.change(page.find('textarea')[0], 'https://shop.example/');
    await page.submit(page.find('form')[0]);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body.input, { url: 'https://shop.example/' });
    assert.equal(requests[0].body.api, job.operation);
    assert.equal(requests[0].headers[ownerIntent.OWNER_SCOPE_HEADER], 'owner');
    assert.deepEqual(ui.visits, ['/noah/tasks/' + id]);
  });
}

void test('the chosen project and operation must still match at the destination', async () => {
  const job = choices[0];
  for (const stale of ['project', 'operation']) {
    const ui = feedScreen({ modules, fetch: async ({url}) => url.startsWith('/api/noah/discover/project?')
      ? { body: { card: {}, connection: { kind: 'setup' }, firstJob: stale === 'project' ? undefined : job } }
      : { body: { ownerScope: 'owner', plan: { endpoints: [{ name: 'unrelated', fields: [] }] } } } });
    const page = detail(ui, job.id);
    await page.flush();
    if (stale === 'operation') await page.click('診断の入力欄を開く');
    assert.match(page.text(), /現在利用できません/);
    assert.ok(page.find('a', '目的を選び直す').length);
    assert.equal(page.find('form').length, 0);
    assert.ok(ui.calls.every(c => c.method === 'GET'));
  }
});

void test('Memory opens an empty note field, accepts only a deliberate request, then shows the returned result', async () => {
  const job = choices.find(choice => choice.id === 'memory'), prompt = '春の展示会は田中さんが会場を担当。';
  const jobs = [];
  const ui = feedScreen({ modules, fetch: async ({url, method, body}) => {
    if (url.startsWith('/api/noah/discover/project?')) return { body: { card: {}, connection: { kind: 'cloud', profile: 'memory', providerFamilyId: null }, firstJob: job } };
    if (method === 'POST') {
      assert.equal(body.action, 'start'); assert.equal(body.prompt, prompt);
      jobs.push({ id: body.jobId, prompt, state: 'returned', result: { text: '田中さん：会場担当' }, files: [] });
    }
    return { body: { ownerScope: 'owner', connection: { id: 'conn', state: 'connected' }, jobs } };
  } });
  const page = detail(ui, job.id);
  await page.flush(); await page.tick(0);
  assert.ok(page.text().includes(job.title) && page.text().includes(job.output));
  const field = page.find('textarea')[0];
  assert.equal(field.props.value, ''); assert.match(field.props.placeholder, /人と担当/);
  assert.equal(page.find('label', '整理したいメモ')[0].props.htmlFor, field.props.id);
  assert.ok(page.find('button', '依頼する')[0].props.disabled);
  assert.ok(ui.calls.every(c => c.method === 'GET'));
  await page.change(field, prompt); await page.submit(page.find('form')[0]);
  assert.equal(jobs.length, 1);
  assert.match(page.text(), /田中さん：会場担当/);
  assert.equal(page.find('a', '保存した成果を見る')[0].props.href, '/noah/saved?tab=results');
});

void test('English and other supported locales retain the meaning of first-party diagnosis and consent fields', async () => {
  for (const job of choices.filter(job => job.operation)) {
    const tool = siteTool(job.id);
    const fields = Object.entries(tool.inputSchema.properties).map(([name, prop]) => ({
      name, label: prop.title, kind: prop.enum ? 'choice' : prop.type === 'string' ? 'text' : 'boolean', choices: prop.enum,
    }));
    for (const locale of NOAH_LOCALES.filter(lang => lang !== 'ja')) {
      for (const text of [tool.description, ...fields.flatMap(field => [field.label, ...(field.choices ?? [])])]) {
        assert.notEqual(noahTranslate(locale, text), text, locale + ' ' + text);
      }
    }
    const ui = feedScreen({ modules, locale: 'en', fetch: async ({url}) => url.startsWith('/api/noah/discover/project?')
      ? { body: { card: {}, connection: {kind:'setup'}, firstJob:job } }
      : { body: { ownerScope: 'owner', plan: { host: 'https://provider.example', endpoints: [{ name: job.operation, description: tool.description, fields }] } } } });
    const page = detail(ui, job.id);
    await page.flush(); await page.click('Open the assessment form');
    assert.match(page.text(), /permission to run this assessment/);
    assert.match(page.text(), job.id === 'wordpress-maintenance' ? /report will be public, and Google/ : /URL will be sent to AgenticCart/);
    assert.equal(page.find('input').every(input => !input.props.checked), true);
    assert.equal(page.find('button', 'Send and run').length, 1);
    if (job.id === 'ec-production') assert.equal(page.find('option','Assessment only')[0].props.value, JSON.stringify('診断のみ'));
  }
});

void test('the English Memory flow labels the destination, explicit connection, prompt, request confirmation and stop', async () => {
  const job = choices.find(choice => choice.id === 'memory');
  let connected = false, running = false;
  const work = { id:'work', state:'running', prompt:'Note text', files:[] };
  const ui = feedScreen({ modules, locale: 'en', fetch: async ({url, method, body}) => {
    if (url.startsWith('/api/noah/discover/project?')) return { body: { card:{}, connection:{ kind:'cloud', profile:'memory' }, firstJob:job } };
    if (method === 'POST') {
      if (!body.confirm && body.action !== 'stop') return { status:409, body:{confirmationRequired:true} };
      if (body.action === 'connect') connected=true;
      if (body.action === 'start') running=true;
      if (body.action === 'stop') running=false;
    }
    if (url.includes('jobId=')) return {body:{ownerScope:'owner',job:work}};
    return {body:{ownerScope:'owner', connection:connected?{id:'conn',state:'connected'}:null, jobs:running?[work]:[]}};
  } });
  const page = detail(ui, job.id);
  await page.flush(); await page.tick(0);
  assert.match(page.text(), /input is sent to Noah’s cloud and a Cloudflare model/);
  await page.click('Connect to get started');
  assert.match(page.text(), /Review the input and its destination/);
  await page.click('Confirm connection');
  assert.match(page.find('textarea')[0].props.placeholder, /responsible for what/);
  await page.change(page.find('textarea')[0], 'Note text');
  await page.submit(page.find('form')[0]);
  await page.click('Confirm request');
  assert.match(page.text(), /Requests and results/);
  assert.match(page.text(), /Note text/);
  await page.click('Stop');
  assert.equal(running, false);
});


void test('a ready project uses the family detail once and shows a dated source even without ratings', async () => {
  const familyId = 'mcp-registry:ai.callmcp/server';
  const listing = 'https://registry.modelcontextprotocol.io/v0.1/servers/ai.callmcp%2Fserver/versions/latest';
  const detailIds = [];
  const ui = feedScreen({ modules: { ...modules, './noah-ready-detail': {
    default: ({ id, sourceNotes }) => { detailIds.push(id); return sourceNotes; },
  } }, fetch: async () => ({ body: {
    card: { id: familyId, sources: [{ source: 'mcp-registry', sourceUrl: listing, observedAt: 1795433820330 }] },
    connection: { kind: 'ready', familyId },
  } }) });
  const page = detail(ui);
  await page.flush();
  assert.deepEqual(new Set(detailIds), new Set([familyId]));
  assert.equal(page.find('a', 'Agentを探す').length, 0);
  assert.equal(page.find('a', 'MCP Registry')[0].props.href, listing);
  assert.equal(page.find('time')[0].props.dateTime, new Date(1795433820330).toISOString());
  assert.equal(page.find('h2', '外部の評価').length, 0);
});

const trainingId = 'project-777248dbd7e37423d0bae088fc9201cfec479dd305b7d94a544cd22face444ad';
const trainingCard = { name: '法人のsi導入準備', topic: 'work', sources: [] };
const projectDetail = 'components/noah-project-detail.tsx';

function assertTrainingVideo(page, fullscreen = false) {
  const videos = page.find('video');
  assert.equal(videos.length, 1);
  const [video] = videos;
  assert.equal(video.props.src, '/noah/theater/training.mp4');
  assert.equal(video.props.poster, '/noah/theater/training.webp');
  assert.equal(video.props.controls, fullscreen ? undefined : true);
  assert.equal(video.props.playsInline, true);
  assert.equal(video.props.preload, fullscreen ? 'auto' : 'none');
  assert.equal(Boolean(video.props.autoPlay), fullscreen);
  assert.equal(Boolean(video.props.loop), fullscreen);
  if (fullscreen) {
    assert.equal(video.props['aria-label'], '会議の前の五分間');
    assert.ok(page.nodes().some(node => node.props['data-noah-fullscreen-detail'] === true));
    const target = page.nodes().find(node => node.props.id === 'noah-project-details');
    assert.equal(target.props.tabIndex, -1);
    assert.ok(page.nodes().indexOf(video) < page.nodes().indexOf(target));
    assert.equal(page.find('a', '詳細 ↓').length, 0);
    assert.equal(page.find('a', 'Agentを探す')[0].props.href, '/noah');
    assert.ok(page.find('summary', '使い方を読む').length);
    return video;
  }
  const figure = page.find('figure').find(node => page.nodes(node).includes(video));
  assert.ok(figure);
  assert.ok(page.nodes(figure).some(node => node.type === 'figcaption' && page.text(node).includes('会議の前の五分間')));
  return video;
}

void test('the training detail loops silently, switches themes and only adds a plugin after a deliberate click', async () => {
  const ui = feedScreen({ modules, fetch: async ({ url }) => url.startsWith('/api/noah/feedback')
    ? { body: { agentName: trainingCard.name, summary: { users: 0, crowns: 0, comments: 0, crowned: false }, comments: [], cursor: null, canComment: false, authenticated: false } }
    : { body: { card: trainingCard, connection: { kind: 'setup' } } } });
  const page = ui.mount(projectDetail, { id: trainingId });
  assert.equal(page.find('video').length, 0);
  await page.flush();
  assertTrainingVideo(page, true);
  assert.equal(page.find('h2', 'Noahで使う').length, 0);
  assert.equal(page.find('button', '使う').length, 0);
  assert.equal(page.find('summary', '利用設定').length, 0);
  assert.equal(page.find('button', 'プラグインを追加').length, 1);
  assert.ok(page.nodes().indexOf(page.find('h2', '詳細')[0]) < page.nodes().indexOf(page.find('h2', '口コミ・評価')[0]));
  const theme = () => page.nodes().find(node => node.props['data-noah-fullscreen-detail'])?.props['data-theme'];
  assert.equal(theme(), 'dark');
  assert.equal(page.find('button').some(node => ['ホワイトモード', 'ダークモード'].includes(node.props['aria-label'])), false);
  const preferences = ui.mount('components/noah-appearance.tsx');
  await preferences.change(preferences.find('select')[0], 'light');
  page.render();
  assert.equal(theme(), 'light');
  await preferences.change(preferences.find('select')[0], 'dark');
  page.render();
  assert.equal(theme(), 'dark');
  assert.deepEqual(ui.calls.map(call => [call.method, call.url]), [['GET', '/api/noah/discover/project?id=' + trainingId], ['GET', '/api/noah/feedback?agent=' + trainingId]]);
});

void test('plugin addition persists the MCP definition, retries the same id and reopens an existing addition without running it', async () => {
  let saved, attempts = 0;
  const ui = feedScreen({ modules, fetch: async ({ url, method, body }) => {
    assert.equal(url, '/api/noah/agents');
    if (method === 'GET') return { body: { ownerScope: 'owner-a', agents: saved ? [saved] : [] } };
    assert.equal(body.rightsConfirmed, true);
    assert.deepEqual(body.manifest, trainingPlugin.noahTrainingPlugin);
    if (!attempts++) { saved = { id: body.id, manifest: body.manifest, uploadState: 'ready' }; return { status: 503, body: { error: '応答を確認できません。' } }; }
    assert.fail('a saved plugin must be found before creating another copy');
  } });
  const page = ui.mount('components/noah-training-plugin.tsx');
  await page.flush();
  assert.equal(ui.calls.length, 0);
  await page.click('プラグインを追加');
  assert.equal(page.find('a', 'プラグインを開く').length, 0);
  await page.click('プラグインを追加');
  assert.equal(page.find('a', 'プラグインを開く')[0].props.href, `/noah/agents/${saved.id}`);
  assert.equal(attempts, 1);
  assert.ok(ui.calls.every(call => call.url === '/api/noah/agents'));
});

void test('the ready training project keeps its connect button and renders the film on the family detail', async () => {
  const familyId = 'mcp-registry:test.provider/training';
  const ui = feedScreen({ modules: { ...sharedModules, '@/lib/noah-bot-notice': botNotice, './noah-ask': quiet }, fetch: async ({ url }) => {
    if (url === '/api/noah/discover/project?id=' + trainingId) return { body: {
      card: trainingCard, connection: { kind: 'ready', familyId },
    } };
    if (url === '/api/noah/intake?id=' + encodeURIComponent(familyId)) return { body: {
      ...trainingCard, id: familyId, summary: '', listed: true, ownerScope: null, connection: null, tools: 1, users: 0,
      connect: { badge: 'unverified', level: 1, placeLabel: '研修用クラウド', price: { model: 'free' } },
    } };
    return { body: { items: [], providers: [] } };
  } });
  const page = ui.mount(projectDetail, { id: trainingId });
  await page.flush();
  const video = assertTrainingVideo(page, true);
  const [connect] = page.find('button', '接続');
  assert.ok(connect);
  assert.ok(page.nodes().indexOf(video) < page.nodes().indexOf(connect));
  const readPaths = ['/api/noah/discover/project', '/api/noah/intake', '/api/noah/registration', '/api/noah/pins'];
  assert.ok(ui.calls.every(call => call.method === 'GET' && readPaths.includes(call.url.split('?')[0])));
});

void test('a same-named project, a first-job entry, and a failed detail load have no training video', async () => {
  const setup = { card: trainingCard, connection: { kind: 'setup' } };
  const job = choices[0];
  for (const [props, reply, expected] of [
    [{ id: project }, { body: setup }, '法人のsi導入準備'],
    [{ id: trainingId, firstJob: job.id }, { body: { ...setup, firstJob: job } }, job.title],
    [{ id: trainingId }, { status: 503, body: { error: 'offline' } }, 'offline'],
  ]) {
    const ui = feedScreen({ modules, fetch: async () => reply });
    const page = ui.mount(projectDetail, props);
    await page.flush();
    assert.ok(page.text().includes(expected));
    assert.equal(page.find('video').length, 0);
    assert.ok(ui.calls.every(call => call.method === 'GET'));
  }
});

void test('appearance selected in preferences reaches home, account and Agent detail shells across navigation', async () => {
  let path = '/noah';
  const ui = feedScreen({ modules: { ...modules,
    'next/navigation': { usePathname: () => path },
    '@/lib/noah-surface': noahSurface,
    './noah-revenue-pack': { NoahRevenuePackMenuItem: () => null },
  }, fetch: async () => ({ body: {} }) });
  const preferences = ui.mount('components/noah-appearance.tsx');
  const shell = ui.mount('components/noah-shell.tsx', { mode: 'public', children: 'Agent content' });
  const appearance = () => shell.find('div').find(node => node.props['data-noah-surface'])?.props['data-theme'];
  for (const value of ['light', 'dark']) {
    await preferences.change(preferences.find('select')[0], value);
    for (path of ['/noah', '/noah/account', '/noah/discover/agent', '/noah/agents/owned', '/noah/preferences']) {
      shell.render();
      assert.equal(appearance(), value, path);
      assert.ok(shell.text().includes('Agent content'));
    }
  }
  assert.equal(ui.calls.length, 0);
});

void test('ready detail resolves family feedback through the real project API before loading ratings',async()=>{
  const family='mcp-registry:ac.mizan/registry';
  const api=createNoahProjectApi({directory:async()=>[{card:{id:family,feedbackId:project,name:'Mizan',summary:'Public catalog entry'},families:[family]}]});
  const ui=feedScreen({modules,fetch:async({url})=>{
    if(url.startsWith('/api/noah/discover/project?')) {const r=await api(new Request('https://noah.test'+url));return {status:r.status,body:await r.json()};}
    assert.equal(url,'/api/noah/feedback?agent='+project);
    return {body:{agentName:'Mizan',summary:{users:1,crowns:0,comments:0,crowned:false},comments:[],cursor:null,canComment:false,authenticated:false}};
  }});
  const page=ui.mount('components/noah-detail-template.tsx',{id:family,name:'Mizan',feedbackId:family});await page.flush();
  assert.equal(ui.calls[0].url,'/api/noah/discover/project?'+new URLSearchParams({family}));
  assert.equal(ui.calls.length,2);assert.ok(ui.calls.every(call=>call.method==='GET'));
  assert.doesNotMatch(page.text(),/評価を読み込めませんでした/);assert.match(page.text(),/人が利用/);
});
