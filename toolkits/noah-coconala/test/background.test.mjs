import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createConnector } from '../../sky-mcp-connector/server.mjs';
import { stageFile } from '../jobs.mjs';

test('Noahの承認を通して返信・応募・添付付き正式納品を専用Chromeで1回ずつ行う', async () => {
  const root = await mkdtemp(join(tmpdir(), 'noah-coconala-acceptance-'));
  const previous = process.env.NOAH_TEST_DIRECTORY;
  process.env.NOAH_TEST_DIRECTORY = root;
  const here = dirname(fileURLToPath(import.meta.url)),
    origin = 'http://127.0.0.1:3000';
  const registryPath = join(root, 'registry.json');
  await writeFile(
    registryPath,
    JSON.stringify({
      schema: 'rockstaros-mcp-registry/1',
      servers: [
        {
          id: 'noah-coconala',
          name: 'ココナラ',
          description: 'isolated local test',
          transport: 'stdio',
          cwd: here,
          command: process.execPath,
          args: ['fixture-worker.mjs'],
          env: ['NOAH_TEST_DIRECTORY', 'HOME'],
          required: true,
        },
      ],
    }),
  );
  await writeFile(
    join(root, 'site.json'),
    JSON.stringify({ reply: [], apply: [], deliver: [], room_reply: [] }),
  );
  const file = join(root, '納品.txt');
  await writeFile(file, '合成した納品物');
  const artifact = await stageFile(root, file);
  const discovery = join(root, 'discovery');
  await mkdir(discovery);
  const connector = await createConnector({
    registryPath,
    port: 0,
    allowedOrigins: new Set([origin]),
    localToolDirectory: discovery,
  });
  let token = '';
  async function call(route, payload) {
    const r = await fetch('http://127.0.0.1:' + connector.port + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json() };
  }
  const prefix = '/servers/noah-coconala/';
  async function approved(name, args) {
    const input = { name, arguments: args };
    const { status, body } = await call(prefix + 'prepare', input);
    assert.equal(status, 200, JSON.stringify(body));
    const locked = await call(prefix + 'execute', {
      ...input,
      arguments: { ...args, target: '999' },
      approvalToken: body.approvalToken,
      confirmed: true,
    });
    assert.notEqual(locked.status, 200);
    const ticket = await call(prefix + 'prepare', input);
    const receipt = await call(prefix + 'execute', {
      ...input,
      approvalToken: ticket.body.approvalToken,
      confirmed: true,
    });
    assert.equal(receipt.status, 200, JSON.stringify(receipt.body));
    return receipt.body.result.structuredContent;
  }
  try {
    token = (await call('/connect', {})).body.token;
    assert.equal((await call(prefix + 'connect', {})).status, 200);
    const inputs = [
      [
        'reply',
        {
          requestId: randomUUID(),
          target: '101',
          message: '返信を確認しました',
        },
      ],
      [
        'apply',
        {
          requestId: randomUUID(),
          target: '202',
          message: '仕様に沿って制作します',
          due: '2027-02-15',
          price: 15000,
        },
      ],
      [
        'deliver',
        {
          requestId: randomUUID(),
          target: '303',
          message: '成果物をお届けします',
          ...artifact,
        },
      ],
      [
        'room_reply',
        { requestId: randomUUID(), target: '304', message: '進めています' },
      ],
    ];
    for (const [name, args] of inputs) {
      const receipt = await approved(name, args);
      assert.equal(
        receipt.state,
        'completed',
        name +
          ' ' +
          JSON.stringify(receipt) +
          ' ' +
          (await readFile(join(root, 'fixture-error.txt'), 'utf8').catch(
            () => '',
          )),
      );
      assert.deepEqual(await approved(name, args), receipt);
      assert.deepEqual(
        await approved('status', { requestId: args.requestId }),
        receipt,
      );
    }
    const state = JSON.parse(await readFile(join(root, 'site.json'), 'utf8'));
    assert.deepEqual(state, {
      reply: [{ message: inputs[0][1].message }],
      apply: [
        { message: inputs[1][1].message, price: '15000', due: '2027-02-15' },
      ],
      deliver: [
        {
          message: inputs[2][1].message,
          filename: '納品.txt',
          bytes: '合成した納品物',
          formal: true,
        },
      ],
      room_reply: [{ message: '進めています' }],
    });
  } finally {
    connector.hub.close();
    connector.server.closeAllConnections();
    await new Promise((resolve) => connector.server.close(resolve));
    if (previous === undefined) delete process.env.NOAH_TEST_DIRECTORY;
    else process.env.NOAH_TEST_DIRECTORY = previous;
    await rm(root, { recursive: true, force: true });
  }
});
