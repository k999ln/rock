import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve('toolkits/mr'),server=path.join(root,'mcp_server.py');
function messages(input){const r=spawnSync('python3',[server],{input:input.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('\n')+'\n',encoding:'utf8',maxBuffer:20e6,timeout:30000});assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return r.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);}
const call=(id,name,args)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}});
test('MCP lifecycle lists four tools and runs all four through stdio',()=>{
  const outputs=messages([
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}},
    {jsonrpc:'2.0',method:'notifications/initialized'},
    {jsonrpc:'2.0',id:2,method:'tools/list'},
    call(3,'coconala_check',JSON.parse(readFileSync(path.join(root,'examples/coconala.json'),'utf8'))),
    call(4,'format_citations',{text:'本文。（出典: [Python](https://python.org)）'}),
    call(5,'make_free_article',{markdown:readFileSync(path.join(root,'examples/article.md'),'utf8'),summary:readFileSync(path.join(root,'examples/summary.md'),'utf8'),afterChars:40,price:500,paidContents:'作業手順',noteUrl:'https://note.com/example/n/example'}),
    call(6,'verify_delivery',{sample:true}),
  ]);
  assert.equal(outputs.length,6);assert.equal(outputs[0].result.protocolVersion,'2025-11-25');assert.equal(outputs[1].result.tools.length,4);
  assert.equal(outputs[2].result.structuredContent.status,'PASS');
  for(const o of outputs.slice(2)){assert.equal(o.result.isError,false,JSON.stringify(o));assert.ok(o.result.structuredContent.output.length>0);}
  assert.match(outputs[3].result.structuredContent.output,/https:\/\/python.org/);assert.equal(outputs[5].result.structuredContent.status,'PASS');
});
test('MCP reports ineligible work as needs-review rather than a passed step',()=>{
  const output=messages([call(1,'coconala_check',{brief:'毎週Zoom面談への参加が必須です。',proposal:'対応します。',bucket:'retainer'})])[0];
  assert.equal(output.result.isError,false);
  assert.equal(output.result.structuredContent.status,'NEEDS_REVIEW');
});
function filesFrom(base){return readdirSync(base).flatMap(name=>{const p=path.join(base,name);return statSync(p).isDirectory()?filesFrom(p):[{path:path.relative(path.join(root,'examples/delivery'),p).split(path.sep).join('/'),base64:readFileSync(p).toString('base64')}];});}
test('delivery verifies supplied bytes and rejects altered artifacts',()=>{
  const review=JSON.parse(readFileSync(path.join(root,'examples/delivery-review.json'),'utf8')),files=filesFrom(path.join(root,'examples/delivery'));
  const first=messages([call(1,'verify_delivery',{review,files})])[0];assert.equal(first.result.structuredContent.status,'PASS');
  const bad=files.map(f=>f.path==='draft.md'?{...f,base64:Buffer.from('changed').toString('base64')}:f);
  const second=messages([call(2,'verify_delivery',{review,files:bad})])[0];assert.equal(second.result.structuredContent.status,'BLOCKED');
});
test('MCP rejects filesystem escapes, shell requests, invalid input and gigantic numbers without dying',()=>{
  const review=JSON.parse(readFileSync(path.join(root,'examples/delivery-review.json'),'utf8'));
  const forbidden=['../outside','/tmp/outside','C:../outside','D:/outside','a\\outside'];
  const inputs=forbidden.map((p,i)=>call(i+1,'verify_delivery',{review,files:[{path:p,base64:'eA=='}]}));
  inputs.push(call(8,'shell',{command:'echo test'}),call(9,'coconala_check',{brief:'a',proposal:'b',orderRate:true}));
  inputs.push('{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"coconala_check","arguments":{"brief":"a","proposal":"b","orderRate":1'+('0'.repeat(400))+'}}}');
  inputs.push({jsonrpc:'2.0',id:11,method:'ping'});
  const out=messages(inputs);for(const o of out.slice(0,-1))assert.equal(o.result.isError,true);assert.deepEqual(out.at(-1).result,{});
});
test('MCP malformed JSON receives a protocol error and no-id calls never execute',()=>{
  const out=messages(['{bad',{jsonrpc:'2.0',method:'tools/call',params:{name:'verify_delivery',arguments:{sample:true}}},{jsonrpc:'2.0',id:3,method:'ping'}]);
  assert.equal(out.length,2);assert.equal(out[0].error.code,-32700);assert.deepEqual(out[1].result,{});
});
