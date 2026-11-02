import test from 'node:test';
import assert from 'node:assert/strict';
import {eveAgentConversationPath} from '../lib/eve-studio-navigation.ts';
void test('new conversation retains saved agent revision, device/model pins and chosen build view',()=>{
 const id=crypto.randomUUID(),query=new URLSearchParams({agent:'saved-role',agentRevision:'7',device:'pixel',deviceAgent:'native',agentHash:'aa',modelHash:'bb',runtime:'1',modelScheme:'gguf-sha256'});
 const before=query.toString(),url=new URL(eveAgentConversationPath(before,id,'build'),'https://fixture.test');
 for(const [key,value] of query)assert.equal(url.searchParams.get(key),value);
 assert.equal(query.toString(),before);assert.equal(url.searchParams.get('thread'),id);assert.equal(url.searchParams.get('view'),'build');
 const work=new URL(eveAgentConversationPath(url.search,'12345678-1234-1234-1234-123456789012','work'),'https://fixture.test');assert.equal(work.searchParams.get('view'),'work');assert.equal(work.searchParams.get('agentRevision'),'7');assert.equal(work.searchParams.getAll('thread').length,1);
});
void test('invalid conversation or mode cannot change the navigation context',()=>{
 assert.throws(()=>eveAgentConversationPath('agent=role','wrong','build'));assert.throws(()=>eveAgentConversationPath('',crypto.randomUUID(),'other'));
});
