/** Read-only Chrome UX checks. Install playwright-core outside the repository, then:
 * NOAH_PLAYWRIGHT_PACKAGE=/absolute/path/node_modules/playwright-core/index.js
 * NOAH_CHROME_PATH=/absolute/path/to/chrome node scripts/test-noah-mobile-browser.mjs
 * Optional NOAH_TEST_URL and NOAH_TEST_OUTPUT. No personal browser profile is used.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NOAH_PLAYWRIGHT_PACKAGE || 'playwright-core');
const output=process.env.NOAH_TEST_OUTPUT ? resolve(process.env.NOAH_TEST_OUTPUT) : await mkdtemp(join(tmpdir(),'noah-mobile-browser-'));
const base=process.env.NOAH_TEST_URL || 'https://avoado.si';
await mkdir(output,{recursive:true,mode:0o700});
console.log(`Browser report directory: ${output}`);
const browser=await chromium.launch({executablePath:process.env.NOAH_CHROME_PATH,headless:true});
const report={browser:browser.version(),base,startedAt:new Date().toISOString(),checks:[]};
async function check(name,run){try{const detail=await run();report.checks.push({name,pass:true,detail});console.log(`PASS ${name}`);}catch(error){const message=error.message.split('Call log:')[0].trim();report.checks.push({name,pass:false,error:message});console.log(`FAIL ${name}: ${message}`);}}
async function ready(page){await page.locator('#noah-collection article').first().waitFor();}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflows horizontally');}
async function size(locator){const r=await locator.boundingBox();assert.ok(r && r.width>=43.9 && r.height>=43.9,`small target: ${JSON.stringify(r)}`);}
async function noOverlap(page){const boxes=await page.locator('#noah-collection article').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(!(a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1),`overlapping cards ${i}, ${j}`);}}
async function swipe(page,context,locator){await locator.scrollIntoViewIfNeeded();const r=await locator.boundingBox(),session=await context.newCDPSession(page),y=Math.round(r.y+r.height/2);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y}]});for(let x=280;x>=30;x-=25){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await page.waitForTimeout(20);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();await page.waitForTimeout(200);}
try{
 for(const width of process.env.NOAH_TEST_WIDTH ? [Number(process.env.NOAH_TEST_WIDTH)] : [320,360,390,430,1280]){
  const mobile=width<500,context=await browser.newContext({viewport:{width,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Opening a fresh anonymous browser session is allowed; block ratings, posts,
  // saved-board writes and Agent execution even if a selector regresses.
  await page.route('**/api/noah/**',async route=>{const req=route.request(),url=new URL(req.url());if(!['GET','HEAD'].includes(req.method()) && url.pathname!=='/api/noah/session')return route.abort();return route.continue();});
  const press=locator=>mobile?locator.tap():locator.click();
  await check(`${width}: loading layout and reduced motion`,async()=>{
   let release;const pending=new Promise(resolve=>{release=resolve;}),hold=async route=>{await pending;await route.continue();};
   await page.route('**/api/noah/discover?**',hold);
   try{
    await page.goto(`${base}/noah`,{waitUntil:'domcontentloaded'});const loading=page.locator('#noah-collection output');await loading.waitFor();await noOverflow(page);
    assert.equal(await loading.getAttribute('aria-live'),'polite');await page.screenshot({path:`${output}/loading-${width}.png`});
    await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await loading.evaluate(e=>[e,...e.querySelectorAll('*')].every(n=>getComputedStyle(n).animationName==='none')),'loading animation ignores reduced motion');
   }finally{release();await page.unroute('**/api/noah/discover?**',hold);await page.emulateMedia({reducedMotion:'no-preference'});}
   await ready(page);
  });
  await check(`${width}: layout and touch targets`,async()=>{
   await page.goto(`${base}/noah`,{waitUntil:'domcontentloaded'});await ready(page);await noOverflow(page);await noOverlap(page);
   await size(page.getByLabel('メニュー',{exact:true}));await size(page.getByLabel('登録情報を見る',{exact:true}));
   const ratings=page.locator('article [aria-label="評価元の評価"] a');await size(await ratings.count()?ratings.first():page.locator('article summary').filter({hasText:'出典・外部の評価'}).first());
   await page.screenshot({path:`${output}/home-${width}.png`});const cards=await page.locator('article').count();
   // The live ranking may put external-only cards on the entire first page.
   // Select the product's connectable filter before testing saved-board actions.
   const connected=page.waitForResponse(r=>r.url().includes('/api/noah/discover?')&&new URL(r.url()).searchParams.get('source')==='noah');await press(page.locator('[aria-label="Agentを絞り込む"]').getByRole('button',{name:'接続できる',exact:true}));await connected;await page.locator('article button[aria-label$="を保存"]').first().waitFor();
   if(mobile){await size(page.locator('article button[aria-label$="を保存"]').first());if(await page.locator('article summary[aria-label="その他の操作"]').count())await size(page.locator('article summary[aria-label="その他の操作"]').first());}
   await noOverflow(page);await noOverlap(page);return {cards};
  });
  await check(`${width}: menu and save open/close, original ratings only`,async()=>{
   await press(page.getByLabel('メニュー',{exact:true}));await page.locator('[popover]:popover-open').waitFor();await page.screenshot({path:`${output}/menu-${width}.png`});await press(page.getByLabel('メニュー',{exact:true}));
   await press(page.locator('article button[aria-label$="を保存"]').first());await page.locator('dialog[open]').waitFor();await size(page.getByRole('button',{name:'閉じる',exact:true}));await press(page.getByRole('button',{name:'閉じる',exact:true}));
   assert.equal(await page.getByLabel('王冠で評価する',{exact:true}).count(),0);assert.equal(await page.locator('dialog[open]').count(),0);
  });
  await check(`${width}: filter swipe, rating and internal Agent detail`,async()=>{
   const filters=page.locator('[aria-label="Agentを絞り込む"]');if(mobile)await swipe(page,context,filters);
   const filtered=page.waitForResponse(r=>r.url().includes('/api/noah/discover?')&&r.url().includes('huggingface'));await press(filters.getByRole('button',{name:'Hugging Face',exact:true}));const listing=await (await filtered).json();await ready(page);
   const card=page.locator('article').filter({hasText:'Semantic Shift Backend'});await card.waitFor();if(await card.locator('[aria-label="評価元の評価"]').count()){await card.getByLabel(/^いいね /).waitFor();assert.match(await card.locator('[aria-label="評価元の評価"]').innerText(),/Hugging Face/);}else{await press(card.getByText('出典・外部の評価',{exact:true}));await card.locator('details[open] a').waitFor();assert.match(await card.locator('details[open]').innerText(),/Hugging Face.*いいね/);}await page.waitForTimeout(250);await noOverlap(page);
   const source=listing.items.find(item=>item.name==='Semantic Shift Backend')?.sources?.find(item=>item.source==='huggingface');assert.equal(typeof source?.metrics?.likes,'number');await card.getByLabel(`いいね ${source.metrics.likes.toLocaleString('ja-JP')}`,{exact:true}).waitFor();await card.screenshot({path:`${output}/external-rating-${width}.png`});
   const previous=page.url(),tabs=context.pages().length;await press(card.locator('a').first());await page.waitForURL('**/noah/discover/agent?**');await page.getByRole('button',{name:'接続して使う',exact:true}).waitFor();assert.equal(new URL(page.url()).origin,new URL(base).origin);assert.equal(context.pages().length,tabs);await noOverflow(page);await size(page.getByRole('button',{name:'接続して使う',exact:true}));assert.equal(await page.locator('a[target="_blank"]').count(),0);await page.screenshot({path:`${output}/agent-detail-${width}.png`});await page.goto(previous);await ready(page);
   await size(page.getByRole('button',{name:'検索条件をクリア',exact:true}));await press(page.getByRole('button',{name:'検索条件をクリア',exact:true}));await ready(page);
   return {source:source.sourceUrl,likes:source.metrics.likes};
  });
  await check(`${width}: home search finds collected Agent and clears`,async()=>{
   const search=page.getByLabel('Agentを探す',{exact:true});await press(search);await search.fill('Semantic Shift');await search.press('Enter');await ready(page);assert.equal(new URL(page.url()).searchParams.get('tab'),'catalog');assert.match(await page.locator('#noah-collection').innerText(),/Semantic Shift Backend/);await noOverflow(page);
   await size(page.getByLabel('検索をクリア',{exact:true}));await page.screenshot({path:`${output}/search-${width}.png`});
   const input=page.getByLabel('Agentを検索',{exact:true});await press(input);await input.fill('noah-test-no-match-8b93f2');await page.getByText('この条件のAgentはまだありません。',{exact:true}).waitFor();await press(page.getByLabel('検索をクリア',{exact:true}));await ready(page);assert.equal(await input.inputValue(),'');
  });
  if(width===390)await check('390: request failure retries and more cards do not overlap',async()=>{
   let failed=false;await page.route('**/api/noah/discover?**',async route=>{if(!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'接続を確認して再試行してください。'})});}else await route.continue();});
   await page.goto(`${base}/noah`);await page.getByRole('alert').filter({hasText:'接続を確認'}).waitFor();await size(page.getByRole('button',{name:'再試行',exact:true}));await press(page.getByRole('button',{name:'再試行',exact:true}));await page.getByRole('button',{name:'もっと見る',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('#noah-collection article').length===20);const count=await page.locator('#noah-collection article').count();assert.equal(count,20);await press(page.getByRole('button',{name:'もっと見る',exact:true}));await page.waitForFunction(n=>document.querySelectorAll('#noah-collection article').length>n,count);await page.waitForTimeout(300);await noOverlap(page);return {before:count,after:await page.locator('article').count()};
  });
  await check(`${width}: no uncaught browser errors`,()=>assert.deepEqual(errors,[]));
  await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
 }
}finally{await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');}
if(report.checks.some(c=>!c.pass))process.exitCode=1;
