import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentDraftFromReply } from '../lib/eve-agent-proposal.ts';

const proposal = {schema:'rockstaros.eve-agent-proposal/1',name:'議事録担当',purpose:'発言から決定事項をまとめる',input:'会議の文章',output:'決定事項と未決事項'};
void test('Eve plain output becomes editable role text without granting capabilities', () => {
  const text='会議の文章を読み、決定事項と未決事項をまとめてください。\n不明な点は本人に確認してください。';
  const draft=eveAgentDraftFromReply(text);
  assert.equal(draft.instructions,text);assert.equal(draft.provider,'local-model');
  assert.equal(draft.requirements,undefined);assert.equal(Object.keys(draft).length,5);
});
void test('structured and fenced Eve proposals map role fields into the existing settings contract',()=>{
  for(const text of [JSON.stringify(proposal),'```json\n'+JSON.stringify(proposal)+'\n```']){
    const draft=eveAgentDraftFromReply(text);assert.equal(draft.name,proposal.name);
    assert.equal(draft.instructions,`目的・役割: ${proposal.purpose}\n受け取るもの: ${proposal.input}\n期待する成果: ${proposal.output}`);
    assert.equal(draft.requirements,undefined);assert.equal(draft.provider,'local-model');
  }
});
void test('unknown, incomplete or authority-bearing structured output is rejected rather than imported',()=>{
  for(const patch of [{schema:'future/2'},{name:''},{input:null},{tool:'shell'},{requirements:{executionTarget:'cloud'}},
    {provider:'external'},{model:'paid-model'},{budget:100},{ownerScope:'other'},{enabled:true}])
    assert.throws(()=>eveAgentDraftFromReply(JSON.stringify({...proposal,...patch})));
  for(const text of ['','{broken','```json\n[]\n```','x'.repeat(1201),'x'.repeat(16001),'bad\u0000text'])
    assert.throws(()=>eveAgentDraftFromReply(text));
});
void test('overlong output requires explicit editing and is never silently truncated',()=>{
  assert.throws(()=>eveAgentDraftFromReply('a'.repeat(1300)),/1200/);
  assert.equal(eveAgentDraftFromReply('a'.repeat(1200)).instructions.length,1200);
  assert.throws(()=>eveAgentDraftFromReply(JSON.stringify({...proposal,purpose:'a'.repeat(1200)})));
});
