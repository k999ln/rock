const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/companion-preview/agent.js'), 'utf8'), context);
const { CompanionAgent } = context.window;

test('requires explicit start and clears work on stop', () => {
  const agent = new CompanionAgent();
  assert.equal(agent.dispatch('しりとり').event, 'BLOCK');
  agent.start();
  assert.equal(agent.dispatch('しりとり').event, 'GAME');
  assert.equal(agent.game.next, 'ご');
  agent.stop();
  assert.equal(agent.game, null);
  assert.equal(agent.dispatch('ごりら').event, 'BLOCK');
});

test('multi-turn play tracks words and rejects wrong start', () => {
  const agent = new CompanionAgent(); agent.start();
  agent.dispatch('しりとり');
  assert.match(agent.dispatch('さる').reply, /「ご」から/);
  const turn = agent.dispatch('ごま');
  assert.equal(turn.event, 'GAME');
  assert.match(turn.reply, /まくら/);
  assert.equal(agent.game.next, 'ら');
});

test('offline safety overrides play; school mode blocks normal requests', () => {
  const agent = new CompanionAgent(); agent.start(); agent.dispatch('しりとり');
  const safety = agent.dispatch('迷った', { offline: true });
  assert.equal(safety.event, 'SAFETY');
  assert.equal(agent.game, null);
  assert.equal(agent.dispatch('しりとり', { mode: 'school' }).event, 'BLOCK');
});

test('message is draft-only and no general model claim', () => {
  const agent = new CompanionAgent(); agent.start();
  const draft = agent.dispatch('迎えに来てと伝えて');
  assert.equal(draft.event, 'DRAFT');
  assert.match(draft.reply, /送信はできません/);
  assert.equal(agent.dispatch('恐竜の種類を教えて').event, 'MODEL_UNAVAILABLE');
  agent.stop();
  assert.equal(agent.draft, null);
});
