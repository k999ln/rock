// Independent wire implementation for local tests. No Rock client/store imports.
import { createServer } from 'node:http';
import { generateKeyPairSync, sign, createHash, randomUUID } from 'node:crypto';
const origin = 'https://process-agent.example.com', name = 'process-fixture-agent';
const keys = generateKeyPairSync('ed25519'), tasks = new Map();
const stats = { sendCalls: 0, cancelCalls: 0, sendsByMessage: {}, cancelsByTask: {} };
const usageUri='https://avoado.si/sky/extensions/usage-context/v1', quoteUri='https://rockstar.example/extensions/price-quote/v1';
let server;
process.once('message', ({ token }) => {
  const receipt = task => {
    const value = { schema: 'rock-a2a-provider-usage-receipt/1', providerId: 'process-fixture-provider', keyId: 'process-key', receiptId: `receipt-${task.id}`,
      ownerUserId: task.input.owner, parentJobId: task.input.mode === 'wrong-job' ? 'wrong-parent' : task.input.parentJobId,
      delegationId: task.input.delegationId, taskId: task.id, agentOrigin: origin, agentName: name, agentVersion: '1.0.0',
      currency: 'USD', amountMinor: 0, pricingVersion: 'fixture-zero-1', issuedAt: Date.now(), usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: 0 }] };
    const bytes = Buffer.concat([Buffer.from('rock-a2a-provider-usage-receipt-signature/1\0'), Buffer.from(JSON.stringify(value))]);
    return { ...value, signature: task.input.mode === 'bad-signature' ? 'A'.repeat(86) : sign(null, bytes, keys.privateKey).toString('base64url') };
  };
  const taskResult = task => ({ id: task.id, status: { state: task.state },
    ...(['TASK_STATE_COMPLETED', 'TASK_STATE_CANCELED'].includes(task.state) ? {
      artifacts: task.state === 'TASK_STATE_COMPLETED' ? [{ name: 'result.txt', parts: [{ text: task.input.mode === 'repair-complete' ? 'READY' : '独立した試験Agentの成果。外部操作はしていません。' }] }] : [],
      metadata: { 'org.rockstar.usageReceipt': receipt(task) },
    } : {}) });
  server = createServer(async (req, res) => {
    const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url === '/.well-known/agent-card.json') return json({ name, description: 'Loopback process fixture only', version: '1.0.0',
      supportedInterfaces: [{ url: origin + '/rpc', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: { streaming: false, pushNotifications: false, extensions: [{uri:usageUri,required:false},{uri:quoteUri,required:false}] } });
    if (req.headers.authorization !== `Bearer ${token}`) return json({ error: 'fixture authentication required' }, 401);
    if (req.url === '/stats') return json(stats);
    if (req.url !== '/rpc' || req.method !== 'POST' || req.headers['a2a-version'] !== '1.0') return json({ error: 'invalid fixture endpoint or protocol version' }, 400);
    const chunks = []; let bytes = 0;
    for await (const part of req) { bytes += part.length; if (bytes > 64000) return json({ error: 'too large' }, 413); chunks.push(part); }
    let rpc;
    try { rpc = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json({ error: 'invalid json' }, 400); }
    const reply = result => json({ jsonrpc: '2.0', id: rpc.id, result });
    if (rpc.method === 'GetPriceQuote') {
      const p=rpc.params, text=p?.message?.parts?.[0]?.text;
      if (typeof text!=='string' || p.executionRequested!==false || p.requestSha256!==createHash('sha256').update(text).digest('hex') || !Number.isSafeInteger(p.maximumBudgetMinor) || p.maximumBudgetMinor<0) return json({error:'invalid quote request'},400);
      const q={schema:'rock-a2a-provider-price-quote/1',providerId:'process-fixture-provider',keyId:'process-key',quoteId:randomUUID(),agentOrigin:origin,agentName:name,agentVersion:'1.0.0',requestSha256:p.requestSha256,pricingVersion:'fixture-zero-1',pricingSha256:'c'.repeat(64),currency:p.currency,estimateMinor:0,maxAmountMinor:p.maximumBudgetMinor,issuedAt:Date.now(),expiresAt:Math.min(p.expiresAt,Date.now()+240000),usage:[{meter:'agent-operation',quantity:1,unit:'request',unitPriceMinor:0,amountMinor:0}]};
      const signature=sign(null,Buffer.concat([Buffer.from('rock-a2a-provider-price-quote-signature/1\0'),Buffer.from(JSON.stringify(q))]),keys.privateKey).toString('base64url');
      return reply({schema:'rock-a2a-price-quote-response/1',quoteRequestId:p.quoteRequestId,priceQuote:{...q,signature}});
    }
    if (rpc.method === 'SendMessage') {
      stats.sendCalls++;
      const message = rpc.params?.message;
      if (message?.role !== 'ROLE_USER' || !message.messageId || rpc.params?.configuration?.returnImmediately !== true) return json({ error: 'invalid message' }, 400);
      stats.sendsByMessage[message.messageId] = (stats.sendsByMessage[message.messageId] || 0) + 1;
      const text=message.parts?.[0]?.text, context=message.metadata?.['org.rockstar.usageContext'];
      let input; try { input = JSON.parse(text); } catch { input={mode:'complete'}; }
      if (typeof text === 'string' && text.startsWith('Repair only the prior result for this same owner job.')) input={mode:'repair-complete'};
      if (context) {
        if (!message.extensions?.includes(usageUri) || !req.headers['a2a-extensions']?.split(',').map(s=>s.trim()).includes(usageUri) || context.messageId!==message.messageId || context.inputSha256!==createHash('sha256').update(text).digest('hex')) return json({error:'invalid usage context'},400);
        input={...input,owner:context.ownerUserId,parentJobId:context.parentJobId,delegationId:context.delegationId};
      } else if (!input.owner || !input.parentJobId || !input.delegationId) return json({error:'fixture task context missing'},400);
      let task = tasks.get(message.messageId);
      if (!task) { task = { id: `task-${message.messageId}`, input, state: ['working', 'unconfirmed-cancel'].includes(input.mode) ? 'TASK_STATE_WORKING' : 'TASK_STATE_COMPLETED' }; tasks.set(message.messageId, task); }
      if (input.mode === 'lost-response') { res.destroy(); return; }
      if (input.mode === 'oversized') return reply({ task: { id: task.id, status: { state: 'TASK_STATE_COMPLETED' }, artifacts: [{ parts: [{ text: 'x'.repeat(1000100) }] }] } });
      return reply({ task: taskResult(task) });
    }
    const task = [...tasks.values()].find(t => t.id === rpc.params?.id);
    if (!task) return json({ jsonrpc: '2.0', id: rpc.id, error: { code: -32001, message: 'Task not found' } });
    if (rpc.method === 'CancelTask') { stats.cancelCalls++; stats.cancelsByTask[task.id] = (stats.cancelsByTask[task.id] || 0) + 1; if (task.input.mode !== 'unconfirmed-cancel') task.state = 'TASK_STATE_CANCELED'; return reply(taskResult(task)); }
    if (rpc.method === 'GetTask') return reply(taskResult(task));
    return json({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } });
  });
  server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port, pid: process.pid,
    publicKeyHex: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex') }));
});
const stop = () => { server?.closeAllConnections(); if (server) server.close(() => process.exit(0)); else process.exit(0); };
process.on('SIGTERM', stop); process.on('disconnect', stop);
