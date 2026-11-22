/** Real Chrome layout regression with synthetic API responses; no provider requests or stored user data. */
import { createRequire } from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.NOAH_PLAYWRIGHT_PACKAGE || 'playwright-core');
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.env.NOAH_TEST_OUTPUT,base=process.env.NOAH_TEST_URL || 'https://avoado.si';
if(!output)throw Error('NOAH_TEST_OUTPUT is required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.NOAH_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report=[];
try {
for(const width of [320,390,1280]) {
 let connected=false;
 const context=await browser.newContext({viewport:{width,height:844},locale:'ja-JP',isMobile:width<500,hasTouch:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const names=['search_beevr','get_pricing','list_services','list_case_studies','get_case_study','list_articles','get_article','about_beevr'];
 await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());let body={};
 if(url.pathname==='/api/noah/session')body={connected:true};
 else if(url.pathname==='/api/noah/discover/project')body={card:{name:'BeevR',summary:'BeevR services',provider:'BeevR',sources:[]},connection:{kind:'ready',familyId:'mcp-registry:ai.beevr/beevr'}};
 else if(url.pathname==='/api/noah/intake')body={id:'mcp-registry:ai.beevr/beevr',name:'BeevR',summary:'Find services, case studies and articles. '.repeat(25),provider:'BeevR',host:'beevr.ai',website:'https://beevr.ai',listed:true,ownerScope:'qa-only',section:'ran',tools:8,oneTap:true,checkedAt:Date.now(),users:1,connect:{badge:'one_click',taps:1,typed:0,placeLabel:'相手のサーバー（beevr.ai）',price:{model:'free'},level:2},connection:connected?{id:'qa-connection',state:'connected',revision:1}:null};
 else if(url.pathname==='/api/noah/connect-plan')body={planSha256:'a'.repeat(64)};
 else if(url.pathname==='/api/noah/connect'&&route.request().method()==='POST'){connected=true;await new Promise(r=>setTimeout(r,250));body={id:'qa-connection',state:'connected',revision:1};}
 else if(url.pathname.endsWith('/tools'))body={host:'beevr.ai',tools:names.map(name=>({name,summary:('Provider description of services, case studies and articles for '+name+'. ').repeat(4),readOnly:true,sha256:'a'.repeat(64),usable:true,required:0,needsConfirm:false,form:{usable:true,fields:[],omitted:0}}))};
 else if(url.pathname==='/api/noah/profile')body={available:true,ownerScope:'qa-only',revision:0,fields:{},grants:[]};
 else if(url.pathname==='/api/noah/ask')body={asks:[]};
 await route.fulfill({json:body});
 });
 await page.goto(`${base}/noah/discover/agent?id=qa-beevr`);
 const connect=page.getByRole('button',{name:'接続',exact:true});await connect.waitFor();
 const before=await connect.boundingBox();assert.ok(before.y>=0&&before.y+before.height<844,JSON.stringify(before));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${output}/noah-tools-connect-${width}.png`});
 await connect.tap();const services=page.locator('[data-tool-name="list_services"]');await services.waitFor();
 await page.screenshot({path:`${output}/noah-tools-tools-${width}.png`});
 assert.match(await services.innerText(),/サービス一覧を見る/);
 // Check real computed layout, including the shared page button styles.
 const layout=await page.locator('[data-tool-name]').evaluateAll(buttons=>buttons.map(button=>{
  const title=button.querySelector('strong').getBoundingClientRect(),description=button.querySelector('p').getBoundingClientRect();
  return {name:button.dataset.toolName,titleHeight:title.height,titleBottom:title.bottom,descriptionTop:description.top,chipHeights:[...button.querySelectorAll('span span')].map(chip=>chip.getBoundingClientRect().height)};
 }));
 for(const row of layout){assert.ok(row.descriptionTop>=row.titleBottom-1,`${width}: ${row.name} description crowds the title`);assert.ok(row.titleHeight<=48,`${width}: ${row.name} title collapses vertically`);assert.ok(row.chipHeights.every(height=>height<=40),`${width}: ${row.name} badge collapses vertically`);}
 await services.tap();await page.locator('form').waitFor();
 assert.equal(await services.locator('..').locator('form').count(),1);
 await page.locator('form').scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/noah-tools-form-${width}.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 report.push({width,connect:before,layout,labels:await page.locator('[data-tool-name] strong').allTextContents(),errors});assert.deepEqual(errors,[]);
 await context.close();
}
}finally{await browser.close();await writeFile(`${output}/tool-layout-report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
