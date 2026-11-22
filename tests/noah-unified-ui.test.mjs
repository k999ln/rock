import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { NOAH_LOCALES, NOAH_MESSAGES, noahTranslate, resolveNoahLocale } from '../lib/noah-i18n.ts';
import { noahWorkGroups, noahWorkStages, noahWorkState } from '../lib/noah-work-view.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { screen } from './fixtures/noah/screen.mjs';

void test('locale negotiation uses supported device languages and falls back to English',()=>{
  for(const [languages,expected] of [[['en-US'],'en'],[['zh-HK'],'zh-CN'],[['ko-KR'],'ko'],[['es-MX'],'es'],[['ar-EG'],'ar'],[['de-DE','ja-JP'],'ja'],[[],'en']])assert.equal(resolveNoahLocale(languages),expected);
  for(const [source,translations] of Object.entries(NOAH_MESSAGES)){
    assert.equal(translations.length,5,source);
    const slots=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort((a,b)=>a.localeCompare(b));
    for(const text of translations){assert.ok(text.trim(),source);assert.deepEqual(slots(text),slots(source),source);}
  }
  for(const locale of NOAH_LOCALES){assert.equal(noahTranslate(locale,'Customer authored text'),'Customer authored text');assert.ok(noahTranslate(locale,'道具 12 個').includes('12'));}
  assert.equal(noahTranslate('en','あと 2 タップ'),'2 more taps');
});
void test('primary screens have translations for every literal UI message',()=>{
  const files=['noah-ask','noah-card','noah-connect-button','noah-interaction','noah-loading','noah-profile-readiness','noah-profile','noah-ready-detail','noah-ready','noah-registration-browser','noah-registration-sheet','noah-registration','noah-shell','noah-timeline','noah-work-list','noah-task-detail','noah-result-content','noah-agent-feedback','noah-public-detail','noah-teikibin','rockstar-account'];
  for(const file of files){const source=ts.createSourceFile(file,readFileSync(new URL(`../components/${file}.tsx`,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(source)==='t'&&ts.isStringLiteral(n.arguments[0]))assert.ok(NOAH_MESSAGES[n.arguments[0].text],`${file}: ${n.arguments[0].text}`);ts.forEachChild(n,visit);}visit(source);
  }
});
void test('work groups prioritize attention and never invent progress beyond remote protocol stages',()=>{
  const asks=[{id:'done',state:'succeeded',finishedAt:10},{id:'running',state:'running'},{id:'failed',state:'failed',finishedAt:9},{id:'wait',state:'needs_user'}];
  assert.deepEqual(noahWorkGroups(asks).map(g=>[g.label,g.items.map(a=>a.id)]),[['確認待ち',['failed','wait']],['作業中',['running']],['履歴',['done']]]);
  assert.deepEqual(noahWorkStages({state:'succeeded'}).map(s=>s.state),['done','done','active']);
  assert.equal(noahWorkState({state:'running',stopRequested:true}),'停止を確認中');
});
const base={id:'job-1',state:'running',revision:2,host:'example.com',tool:'Research',createdAt:1,updatedAt:2};
const modules={'@/lib/noah-ask-view':askView,'@/lib/owner-intent':ownerIntent};
void test('task detail verifies owner membership and stops with the displayed revision and owner scope',async()=>{
  let item={...base};
  const ui=screen({modules,fetch:async request=>{
    if(request.method==='POST'){item={...item,stopRequested:true};return {body:item};}
    return {body:request.url==='/api/noah/ask'?{ownerScope:'scope-a',asks:[item]}:item};
  }});const page=ui.mount('components/noah-task-detail.tsx',{id:base.id});await page.flush();
  await page.click('停止');const sent=ui.calls.find(c=>c.method==='POST');assert.equal(sent.headers[ownerIntent.OWNER_SCOPE_HEADER],'scope-a');assert.deepEqual(sent.body,{action:'stop',revision:2});assert.match(page.text(),/停止を確認中/);
});
void test('task detail hides a result if its owner list does not contain the job',async()=>{
  const item={...base,state:'succeeded',finishedAt:3,result:{text:'Private result'}};
  const ui=screen({modules,fetch:async({url})=>({body:url==='/api/noah/ask'?{ownerScope:'different-owner',asks:[]}:item})});
  const page=ui.mount('components/noah-task-detail.tsx',{id:base.id});await page.flush();assert.doesNotMatch(page.text(),/Private result/);assert.match(page.text(),/仕事を読み込めませんでした/);
});

void test('Noah posts use the same locale, logo loader and Noah account return path',()=>{
  const ui=screen({locale:'es',modules:{'./sky-social-timeline':{default:props=>({type:'section',props:{children:props.translate('ポストする'),'data-account':props.accountHref,'data-loader':Boolean(props.loadingIndicator)}})},'@/lib/noah-surface':{noahActionHref:()=>'/noah/library'}}});
  const page=ui.mount('components/noah-social.tsx',{mode:'public'});const section=page.find('section')[0];assert.equal(page.text(section),'Publicar');assert.equal(section.props['data-account'],'/noah/account?returnTo=%2Fnoah%2Fsocial');assert.equal(section.props['data-loader'],true);
});

void test('profile readiness opens external registration for both saved and missing information',async()=>{
  const provider={id:'p',name:'Provider',agentIds:['agent'],fields:[{key:'email',label:'メール',required:true,profileField:'email'}]};
  for(const fields of [{},{email:'saved@example.com'}]){
    const ui=screen({fetch:async({url})=>({body:url.includes('registration')?{providers:[provider]}:{items:[]}})});
    const page=ui.mount('components/noah-profile-readiness.tsx',{profile:{reuseEnabled:true,fields,documents:[]}});await page.flush();
    assert.equal(page.find('a','Provider')[0].props.href,'/noah/registration?agent=agent');
  }
});
