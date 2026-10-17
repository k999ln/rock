import { skyDirectory } from './sky-directory.mjs';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BridgeStore, check, digest } from './store.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const equal = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createBridgeServer({ path, mode = 'fixture', player = 'mac-test-player', gameToken = '', port = 5216, sky = {} }) {
  check(['fixture', 'fivem', 'fiveplay'].includes(mode), '不正なmode');
  check(mode !== 'fivem' || (/^license:[0-9a-f]+$/i.test(player) && gameToken.length >= 32), 'FiveMには本人のlicense bindingと32文字以上のserver専用tokenが必要です。');
  check(mode !== 'fiveplay' || gameToken.length >= 32, 'FivePlayには32文字以上の専用tokenが必要です。');
  const binding = { mode, server: 'local-development', player: mode === 'fixture' ? player : digest(player), resource: mode === 'fiveplay' ? 'rockstar_fiveplay_overlay' : 'rockstar_bridge', version: 1 };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const store = new BridgeStore(path, binding);
  const directory = skyDirectory(sky);
  chmodSync(path, 0o600);
  const expiresAt = Date.now() + 3600_000;
  const session = randomBytes(32).toString('hex');
  const owner = 'local-developer'; // Local developer sandbox only; never a production identity.
  const assets = { '/': ['dashboard.html', 'text/html'], '/dashboard.js': ['dashboard.js', 'text/javascript'], '/style.css': ['resource/ui/style.css', 'text/css'], '/game': ['resource/ui/index.html', 'text/html'], '/ui.js': ['resource/ui/ui.js', 'text/javascript'] };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const actualPort = server.address()?.port ?? port;
      const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
      check(hosts.includes(req.headers.host), 'Host refused', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const origin = `http://${req.headers.host}`;
      const asset = assets[url.pathname];
      if (req.method === 'GET' && asset) {
        check(!(url.pathname === '/game' && mode !== 'fixture'), 'Simulator disabled in FiveM mode', 403);
        if (url.pathname === '/') res.setHeader('Set-Cookie', `rock_bridge=${session}; HttpOnly; SameSite=Strict; Path=/`);
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        res.end(readFileSync(resolve(root, asset[0]))); return;
      }
      const game = url.pathname.startsWith('/bridge/');
      const simulator = url.pathname.startsWith('/sim/');
      check(game || simulator || url.pathname.startsWith('/api/'), 'Not found', 404);
      if (game) {
        check(Date.now() < expiresAt, 'Development link expired; restart gateway and rotate token', 403);
        check(equal(req.headers.authorization, `Bearer ${gameToken}`), 'Game server authentication required', 403);
        if(mode === 'fivem') { check(!req.headers.origin, 'Origin refused', 403); check(req.headers['x-rock-player'] === binding.player, 'Player binding refused', 403); }
        else { check(mode === 'fiveplay' && (!req.headers.origin || /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin)), 'Extension connection required', 403); }
      } else {
        check(!simulator || mode === 'fixture', 'Simulator disabled', 403);
        check((req.headers.cookie ?? '').split('; ').includes(`rock_bridge=${session}`), '現実側の画面を先に開いてください。', 401);
        check(!req.headers.origin || req.headers.origin === origin, 'Origin refused', 403);
        if (req.method === 'POST') check(req.headers.origin === origin, 'Origin required', 403);
      }
      const actor = game || simulator ? 'game' : 'os';
      if (req.method === 'GET' && url.pathname.endsWith('/state')) {
        send(200, { ...(actor === 'game' ? store.gameSnapshot(owner) : store.snapshot(owner)), sky: actor === 'os' ? await directory() : undefined }); return;
      }
      check(req.method === 'POST' && url.pathname.endsWith('/command'), 'Not found', 404);
      check(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON required', 415);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; check(size <= 16384, 'Input too large', 413); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(game && mode === 'fiveplay') check(input.action === 'agent_request', 'FivePlay can only request work', 403);
      await store.command(owner, actor, input);
      send(200, actor === 'game' ? store.gameSnapshot(owner) : store.snapshot(owner));
    } catch (error) { send(error.status ?? 400, { error: error.message }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, store, listen: () => new Promise(resolveListen => server.listen(port, '127.0.0.1', () => resolveListen(server.address()))) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.env.ROCK_BRIDGE_MODE ?? 'fixture';
  const instance = createBridgeServer({ path: resolve(process.env.ROCK_BRIDGE_DB ?? `work/fivem-bridge/${mode}.sqlite`), mode, player: process.env.ROCK_BRIDGE_PLAYER ?? 'mac-test-player', gameToken: process.env.ROCK_BRIDGE_TOKEN ?? '', port: Number(process.env.ROCK_BRIDGE_PORT ?? 5216), sky: {origin:process.env.ROCK_BRIDGE_SKY_ORIGIN,token:process.env.ROCK_BRIDGE_SKY_TOKEN} });
  const address = await instance.listen();
  console.log(`RockstarOS bridge (${mode}): http://127.0.0.1:${address.port}/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => instance.server.close(() => { instance.store.close(); process.exit(0); }));
}
