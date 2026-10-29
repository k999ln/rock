import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../components/workspace-flow-navigation.tsx',import.meta.url),'utf8');
function navigation(path,hash='',running=false){
 const exports={},jsx=(type,props)=>({type,props});
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require(name){
  if(name==='next/link')return {default:'a'};
  if(name==='next/navigation')return {usePathname:()=>path};
  if(name==='react')return {useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='lucide-react')return {MessageCircle:'message',ListChecks:'list',Cable:'cable',Settings:'settings'};
  throw Error(name);
 },window:{location:{hash}}});
 return exports.default({running}).props.children;
}
void test('Eve view changes use same-document fragments and preserve owner/thread/model query',()=>{
 const current=new URL('https://avoado.si/os/eve?thread=fixture&agentRevision=7&modelHash=aa');
 const items=navigation('/os/eve');
 for(const item of items.slice(0,2)){
  assert.ok(item.props.href.startsWith('#'));
  const next=new URL(item.props.href,current);
  assert.equal(next.search,current.search);assert.equal(next.pathname,current.pathname);
 }
 assert.equal(items[0].props['aria-current'],'page');assert.equal(items[1].props.href,'#eve-work-results');
});
void test('results selection follows the actual fragment without changing the conversation',()=>{
 const items=navigation('/os/eve','#eve-work-results');
 assert.equal(items[1].props['aria-current'],'page');assert.equal(items[0].props.href,'#eve-compose');
});
void test('connection and settings have deterministic return paths and current state',()=>{
 for(const [path,index] of [['/connect/service',2],['/connect/device',2],['/sky/network',2],['/os/sky/network',2],['/settings',3],['/settings/system',3]]){
  const items=navigation(path);assert.equal(items[index].props['aria-current'],'page');
  assert.equal(items[0].props.href,'/os/eve');assert.equal(items[1].props.href,'/os/eve#eve-work-results');
 }
});
void test('pending workspace saves mark all cross-screen links unavailable',()=>{
 const items=navigation('/os/eve','',true);assert.ok(items.every(item=>item.props['aria-disabled']===true));
});
