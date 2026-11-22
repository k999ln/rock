/** Live internal connection checks; public metadata only, no Tool execution or provider signup. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NOAH_PLAYWRIGHT_PACKAGE || 'playwright-core');
const base=process.env.NOAH_TEST_URL || 'https://avoado.si',output=process.env.NOAH_TEST_OUTPUT;
if(!output)throw Error('NOAH_TEST_OUTPUT is required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.NOAH_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ja-JP'});
const page=await context.newPage();page.setDefaultTimeout(20000);
const report={url:base,browser:browser.version(),checks:[]};
await page.route('**/api/**',route=>route.request().method()==='GET'||new URL(route.request().url()).pathname==='/api/noah/session'?route.continue():route.fulfill({status:403,json:{error:'Live QA does not execute Tools or change provider accounts.'}}));
async function check(name,run){try{const proof=await run();report.checks.push({name,pass:true,proof});console.log('PASS '+name);}catch(e){report.checks.push({name,pass:false,error:String(e)});console.error('FAIL '+name+': '+e);}}
async function open(card){await page.goto(`${base}/noah/discover/agent?id=${card.feedbackId??card.id}`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:card.name,exact:true}).waitFor();}
function inside(){assert.equal(new URL(page.url()).origin,new URL(base).origin);assert.equal(context.pages().length,1);}
try{
 await page.goto(`${base}/noah`,{waitUntil:'domcontentloaded'});await page.locator('#noah-collection article').first().waitFor();
 const hf=await (await context.request.get(`${base}/api/noah/discover?source=huggingface`)).json();
 await check('API-only Space stays inside Noah with setup reason',async()=>{
  const card=hf.items.find(c=>c.name==='Semantic Shift Backend');assert.ok(card);await open(card);
  await page.getByRole('button',{name:'接続して使う',exact:true}).tap();await page.getByRole('alert').getByText(/API専用/).waitFor();
  assert.equal(await page.locator('iframe').count(),0);inside();await page.screenshot({path:`${output}/space-api-only.png`});return {name:card.name};
 });
 await check('public Space opens its real input inside Noah without a new tab',async()=>{
  const card=hf.items.find(c=>c.name==='First Agent Template');assert.ok(card);await open(card);
  const response=page.waitForResponse(r=>r.url().includes('/api/noah/discover/project?')&&r.url().includes('open=space'));
  await page.getByRole('button',{name:'接続して使う',exact:true}).tap();assert.equal((await response).status(),200);
  const frame=page.locator('iframe');await frame.waitFor();await frame.scrollIntoViewIfNeeded();
  const input=page.frameLocator('iframe').getByRole('textbox').first();await input.waitFor({state:'visible'});await input.tap();await input.fill('Noah connection test');assert.equal(await input.inputValue(),'Noah connection test');
  inside();const sandbox=await frame.getAttribute('sandbox');assert.ok(!sandbox.includes('allow-popups')&&!sandbox.includes('allow-top-navigation'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/space-input.png`});
  const url=await frame.getAttribute('src');await page.getByRole('button',{name:'閉じる',exact:true}).tap();assert.equal(await page.locator('iframe').count(),0);return {name:card.name,url,executed:false};
 });
 await check('GitHub card opens internal setup and retains repository URL',async()=>{
  const github=await (await context.request.get(`${base}/api/noah/discover?source=github&q=boss-agent-cli`)).json();const card=github.items[0];assert.ok(card);await open(card);
  assert.equal(await page.locator('a[target="_blank"]').count(),0);await page.getByRole('link',{name:'Noahで取込・設定する',exact:true}).tap();await page.waitForURL('**/noah/agents/new?**');inside();
  assert.equal(new URL(page.url()).searchParams.get('sourceUrl'),card.href);await page.screenshot({path:`${output}/github-setup.png`});return {name:card.name,url:page.url()};
 });
 await check('verified project resolves to existing Noah connection plan',async()=>{
  const ready=await (await context.request.get(`${base}/api/noah/discover?source=noah`)).json();const card=ready.items.find(c=>c.feedbackId);assert.ok(card);
  const detail=await (await context.request.get(`${base}/api/noah/discover/project?id=${card.feedbackId}`)).json();assert.equal(detail.connection.kind,'ready');assert.equal(detail.connection.familyId,card.id);
  await open(card);await page.getByRole('button',{name:'接続',exact:true}).waitFor();inside();await page.screenshot({path:`${output}/ready-connection.png`});return {name:card.name,familyId:card.id};
 });
}finally{await browser.close();await writeFile(`${output}/project-report.json`,JSON.stringify(report,null,2)+'\n');}
if(report.checks.some(c=>!c.pass))process.exitCode=1;
