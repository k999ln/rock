// Real browser activation and Web Audio; vibration calls are synthetic, not a physical-device claim.
import {createRequire} from 'node:module';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.NOAH_PLAYWRIGHT_PACKAGE||'playwright-core');
const base=process.env.NOAH_TEST_URL||'http://localhost:8872';
const output=await mkdtemp(join(tmpdir(),'noah-tap-feedback-'));
const browser=await chromium.launch({executablePath:process.env.NOAH_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report=[];
try {
  for(const width of [390,1280]) {
    const context=await browser.newContext({viewport:{width,height:844},locale:'ja-JP',hasTouch:true,isMobile:width<500});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__feedback={contexts:0,starts:[],vibrations:[],latencies:[]};
      const Audio=window.AudioContext;
      window.AudioContext=new Proxy(Audio,{construct(Target,args){window.__feedback.contexts++;window.__feedback.latencies.push(args[0]?.latencyHint);const audio=new Target(...args),create=audio.createOscillator.bind(audio);audio.createOscillator=()=>{const node=create(),start=node.start.bind(node);node.start=(...values)=>{window.__feedback.starts.push({state:audio.state,time:performance.now()});return start(...values);};return node;};return audio;}});
      Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>{window.__feedback.vibrations.push(pattern);return true;}});
    });
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;let body={};
      if(path==='/api/noah/session')body={connected:true};
      if(path==='/api/noah/profile')body={available:true,ownerScope:'qa-only',fields:{},grants:[],revision:0};
      if(path==='/api/noah/discover')body={items:[{id:'qa-registry',name:'Test Agent',provider:'Example',summary:'Example task',host:'example.test',users:0,oneTap:true,topic:'research',shape:0,savedIn:[],sources:[{source:'mcp-registry',sourceUrl:'https://registry.modelcontextprotocol.io/v0.1/servers/qa',observedAt:1}]}],total:1,nextCursor:null};
      await route.fulfill({json:body});
    });
    await page.goto(`${base}/noah`);await page.getByText('Test Agent',{exact:true}).waitFor();
    assert.equal(await page.getByText('MCP公式台帳',{exact:true}).count(),0);
    assert.equal(await page.locator('[aria-label="評価元の評価"]').count(),0);
    const menu=page.getByRole('button',{name:'メニュー',exact:true});
    await menu.tap();await page.waitForTimeout(200);
    let state=await page.evaluate(()=>window.__feedback);assert.equal(state.starts.length,1);assert.equal(state.starts[0].state,'running');assert.equal(state.contexts,1);assert.deepEqual(state.vibrations,[24]);
    await page.keyboard.press('Escape');await page.waitForTimeout(80);await menu.focus();await page.keyboard.press('Enter');await page.waitForTimeout(150);
    state=await page.evaluate(()=>window.__feedback);assert.equal(state.starts.length,2);assert.equal(state.contexts,1);
    await page.keyboard.press('Escape');
    const before=state.starts.length;await page.locator('input[type="search"]').first().fill('test');await page.waitForTimeout(250);
    assert.equal((await page.evaluate(()=>window.__feedback)).starts.length,before);
    await page.goto(`${base}/noah/preferences`);await page.getByRole('button',{name:'反応を試す',exact:true}).waitFor();
    // SSR reports vibration as unsupported; wait for the client capability check before tapping.
    await page.waitForFunction(()=>document.querySelector('[aria-label="タップの振動"] small')?.textContent==='この端末で使う');
    await page.getByRole('button',{name:'反応を試す',exact:true}).tap();await page.waitForTimeout(150);
    state=await page.evaluate(()=>window.__feedback);assert.equal(state.starts.length,1,JSON.stringify({state,errors}));assert.deepEqual(state.vibrations,[24]);
    const sound=page.getByRole('checkbox',{name:'タップ・接続の音',exact:true});
    await sound.uncheck();await page.getByRole('button',{name:'反応を試す',exact:true}).tap();await page.waitForTimeout(150);
    assert.equal((await page.evaluate(()=>window.__feedback)).starts.length,1);
    await page.getByRole('checkbox',{name:'タップの振動',exact:true}).uncheck();
    const muted=await page.evaluate(()=>window.__feedback);await page.getByRole('button',{name:'反応を試す',exact:true}).tap();await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(()=>window.__feedback),muted);
    await sound.check();await page.waitForTimeout(150);
    assert.equal((await page.evaluate(()=>window.__feedback)).starts.length,2);
    await page.emulateMedia({reducedMotion:'reduce'});
    const sample=page.getByRole('button',{name:'反応を試す',exact:true}),box=await sample.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    assert.equal(await sample.evaluate(node=>getComputedStyle(node).scale),'none');await page.mouse.up();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(output,`preferences-${width}.png`)});
    assert.deepEqual(errors,[]);report.push({width,...await page.evaluate(()=>window.__feedback),errors});await context.close();
  }
} finally {await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({output,report}));
