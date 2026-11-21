import test from 'node:test';
import assert from 'node:assert/strict';
import { noahResultText } from '../lib/noah-form.ts';
import { noahResultPresentation, noahResultImageLinks } from '../lib/noah-result-presentation.ts';
import { noahResultImage, noahImageFile, NOAH_IMAGE_BASE64_LIMIT } from '../lib/noah-result-media.ts';
import { finishNoahRemoteWork, createNoahRemoteWork } from '../lib/noah-remote-work.ts';
import * as askView from '../lib/noah-ask-view.ts';
import {screen} from './fixtures/noah/screen.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1kAAAAASUVORK5CYII=';
const received=text=>({text,truncated:false,attachments:0});
const modules={'@/lib/noah-ask-view':askView};
void test('MCP image bytes survive result conversion and the Work completion round trip',async()=>{
  const result=noahResultText({content:null,blocks:[{type:'image',mimeType:'image/png',data:png}]});
  assert.equal(result.images.length,1);assert.equal(result.images[0].data,png);
  const job=createNoahRemoteWork('work',{connectionId:'c',familyKey:'f',digest:'d',agentName:'a',host:'example.com',tool:'draw',toolSha256:'s',toolsSha256:'t',args:{},inputSha256:'i'},1);
  const saved=JSON.parse(JSON.stringify(finishNoahRemoteWork(job,{state:'returned',result,note:'',used:['draw']},2)));
  const file=noahImageFile(saved.noahRemote.result.images[0]);assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.from(png,'base64'));
});
void test('rejects SVG, MIME mismatch, invalid base64 and oversized images without weakening text result compatibility',()=>{
  for(const block of [{type:'image',mimeType:'image/svg+xml',data:Buffer.from('<svg onload="x"/>').toString('base64')},{type:'image',mimeType:'image/jpeg',data:png},{type:'image',mimeType:'image/png',data:'%BAD'},{type:'image',mimeType:'image/png',data:'A'.repeat(NOAH_IMAGE_BASE64_LIMIT+4)}])assert.equal(noahResultImage(block,0),null);
  assert.deepEqual(noahResultText({content:null,blocks:[{type:'text',text:'Hello'}]}),received('Hello'));
});
void test('whoami presents only returned account facts and never claims identity verification',()=>{
  const view=noahResultPresentation(received(JSON.stringify({agent:{name:'Demo',handle:'demo',status:'active',verifiedAt:null},limits:{threads:20}})));
  assert.equal(view.kind,'account');assert.equal(view.summary,'Demo');assert.deepEqual(view.fields,[{label:'ユーザー名',value:'demo'},{label:'状態',value:'active'}]);
});
void test('lists use titles and summaries, unsafe links remain unlinked, and partial JSON is not invented',()=>{
  const view=noahResultPresentation(received(JSON.stringify({count:2,entries:[{title:'One',summary:'A',url:'https://example.com/a'},{title:'Two',url:'javascript:alert(1)'}]})));
  assert.equal(view.count,2);assert.equal(view.cards[0].href,'https://example.com/a');assert.equal(view.cards[1].href,undefined);
  const partial=noahResultPresentation({...received('{"entries":[{"title":"Cut'),truncated:true});assert.equal(partial.kind,'data');assert.equal(partial.summary,'成果の一部を表示しています');
});
void test('external images are explicit, HTTPS only, and not local network targets',()=>{
  assert.deepEqual(noahResultImageLinks('{"image_url":"https://cdn.example.com/signed?id=1"}'),['https://cdn.example.com/signed?id=1']);
  assert.deepEqual(noahResultImageLinks('{"url":"https://example.com/account"}'),[]);
  for(const url of ['http://example.com/a.png','https://user:pass@example.com/a.png','https://127.0.0.1/a.png','https://192.168.1.1/a.png'])assert.deepEqual(noahResultImageLinks(JSON.stringify({image_url:url})),[]);
});
void test('image Save sends real File bytes to the native share sheet; cancellation does not claim gallery save',async()=>{
  const sent=[];const ui=screen({modules,navigator:{canShare:({files})=>files[0].type==='image/png',share:async data=>{sent.push(data);throw new DOMException('cancelled','AbortError');}}});
  const page=ui.mount('components/noah-result-content.tsx',{id:'r',result:{...received('（画像 1 件）'),attachments:1,images:[noahResultImage({type:'image',mimeType:'image/png',data:png},0)]}});await page.flush();await page.click('画像を保存');
  assert.equal(sent.length,1);assert.deepEqual(Buffer.from(await sent[0].files[0].arrayBuffer()),Buffer.from(png,'base64'));assert.doesNotMatch(page.text(),/ギャラリーに保存しました|保存を開始しました/);
});
void test('readable account fields and original data disclosure coexist',async()=>{
  const result=received(JSON.stringify({agent:{name:'Demo',handle:'demo',status:'active'}}));const ui=screen({modules});const page=ui.mount('components/noah-result-content.tsx',{id:'r',result});await page.flush();
  assert.match(page.text(),/アカウント情報Demoユーザー名demo状態利用中/);assert.equal(page.find('details')[0].props.open,undefined);assert.match(page.text(page.find('pre')[0]),/"agent"/);
});

void test('image Save falls back to a real PNG download when native file sharing is unavailable',async()=>{
  let clicked;const link={click(){clicked={href:this.href,name:this.download};}};
  const ui=screen({modules,document:{createElement:()=>link},navigator:{}});
  const result={...received(''),attachments:1,images:[noahResultImage({type:'image',mimeType:'image/png',data:png},0)]};
  const page=ui.mount('components/noah-result-content.tsx',{id:'r',result});await page.flush();await page.click('画像を保存');
  assert.equal(clicked.name,'noah-image-1.png');const response=await fetch(clicked.href);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(png,'base64'));URL.revokeObjectURL(clicked.href);
  assert.match(page.text(),/保存を開始しました/);assert.doesNotMatch(page.text(),/ギャラリーに保存しました/);
});
void test('embedded image resources are retained with the same MIME validation',()=>{
  const result=noahResultText({content:null,blocks:[{type:'resource',resource:{mimeType:'image/png',blob:png}}]});
  assert.equal(result.images[0].data,png);assert.equal(result.text,'（画像 1 件）');
});
void test('MCP image resource links preserve the image destination and do not fetch it on the server',()=>{
  const result=noahResultText({content:null,blocks:[{type:'resource_link',mimeType:'image/png',uri:'https://cdn.example.com/generated/1'}]});
  assert.deepEqual(result.imageUrls,['https://cdn.example.com/generated/1']);assert.equal(noahResultPresentation(result).kind,'image');
  const unsafe=noahResultText({content:null,blocks:[{type:'resource_link',mimeType:'image/png',uri:'http://127.0.0.1/private'}]});assert.equal(unsafe.imageUrls,undefined);
});
