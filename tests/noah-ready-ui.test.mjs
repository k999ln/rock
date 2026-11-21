import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as forms from '../lib/noah-form.ts';
const jsx=(type,props)=>({type,props});
const nodes=(tree,result=[])=>{if(Array.isArray(tree))tree.forEach(n=>nodes(n,result));else if(tree&&typeof tree==='object'){result.push(tree);nodes(tree.props?.children,result);}return result;};
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(name,fetcher=async()=>({items:[]}),options={}){
 const values=[],refs=[],effects=[];let index=0,refIndex=0,mounted=false;
 const source=readFileSync(new URL('../components/'+name+'.tsx',import.meta.url),'utf8');
 const exports={},modules={react:{useCallback:fn=>fn,useState(initial){const i=index++;if(!(i in values))values[i]=initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(value){const i=refIndex++;return refs[i]??=({current:value});},useEffect(fn){if(!mounted)effects.push(fn);}},'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'a'},'lucide-react':new Proxy({},{get:(_,key)=>String(key)}),'@/lib/noah-form':forms,'@/lib/noah-remote-client':{noahRemoteFetch:fetcher},'./noah-ready.module.css':{default:new Proxy({},{get:(_,key)=>String(key)})}};
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,crypto,queueMicrotask,URL,Date,AbortController,window:{innerWidth:390},document:{hidden:!!options.hidden,addEventListener(){},removeEventListener(){}},setTimeout:options.timer??setTimeout,clearTimeout,require(name){assert.ok(name in modules,name);return modules[name];}});
 return {render(props){index=0;refIndex=0;const tree=exports.default(props);mounted=true;return tree;},async mount(){for(const fn of effects)fn();await new Promise(setImmediate);},source,exports};
}
void test('cards have one primary action, textual badges and provider destination; descriptions stay text',()=>{
 const h=harness('noah-card'),item={id:'agent',name:'Agent',summary:'<script>takeScreen()</script>',host:'provider.example.com',provider:'Test',section:'new',tools:2,oneTap:true};
 const tree=h.render({item});assert.equal(nodes(tree).filter(n=>n.props?.className==='cardAction').length,1);assert.equal(nodes(tree).filter(n=>n.type==='script').length,0);
 assert.match(text(tree),/まだ誰も動かしていない/);assert.match(text(tree),/相手のサーバー（provider.example.com）/);assert.match(text(tree),/無料/);
 assert.match(text(h.render({item:{...item,section:'ran'}})),/1 クリック/);
});
void test('one usable tool opens its form; first click reviews uncertain tools without submitting; cancel sends nothing',async()=>{
 const raw={name:'review',description:'A provider description',readOnly:false,inputSchema:{type:'object',properties:{}}};
 const menu=(await forms.noahToolMenu([raw],[])).map(t=>({...t,form:forms.noahToolForm(raw)}));let posts=0;
 const h=harness('noah-ask',async(_,options)=>{if(options?.body)posts++;return {tools:menu};});const props={connection:{id:'id',host:'provider.example.com'},ownerScope:'scope',onSubmitted(){}};
 h.render(props);await h.mount();let tree=h.render(props);assert.match(text(tree),/入力は provider.example.com へ送られます/);
 const form=nodes(tree).find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});tree=h.render(props);
 assert.equal(posts,0);assert.match(text(tree),/送る前に確認/);nodes(tree).find(n=>n.type==='button'&&text(n)==='やめる').props.onClick();assert.equal(posts,0);
 tree=h.render(props);nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=h.render(props);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='確かめて頼む').props.onClick();await new Promise(setImmediate);assert.equal(posts,1);
});
void test('finished jobs and hidden pages do not schedule polling; active jobs do',async()=>{
 for(const [hidden,state,expected] of [[true,'running',0],[false,'succeeded',0],[false,'running',1]]){
  let reads=0,timers=0;const h=harness('noah-work-list',async()=>{reads++;return {items:[{id:'job',state,createdAt:Date.now()}]};},{hidden,timer(){timers++;return 1;}});
  h.render({ownerScope:'scope',refresh:0});await h.mount();assert.equal(timers,expected);if(hidden)assert.equal(reads,0);
 }
});
void test('all launch surfaces avoid screen capture, modal blockers and interpreted provider HTML',()=>{
 for(const name of ['noah-ready','noah-ready-detail','noah-card','noah-connect-button','noah-ask','noah-work-list']){
  const source=readFileSync(new URL('../components/'+name+'.tsx',import.meta.url),'utf8');assert.doesNotMatch(source,/dangerouslySetInnerHTML|aria-modal|<dialog|getDisplayMedia|requestFullscreen|clipboard\.read/);
 }
 const detail=readFileSync(new URL('../components/noah-ready-detail.tsx',import.meta.url),'utf8');assert.match(detail,/Official MCP Registry/);assert.doesNotMatch(detail,/公認|公式パートナー|提携/);
});
