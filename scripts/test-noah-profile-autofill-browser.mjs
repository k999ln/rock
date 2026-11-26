/** Native Chromium autofill with synthetic contact data; all app APIs are mocked. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.NOAH_PLAYWRIGHT_PACKAGE || '../toolkits/noah-coconala/node_modules/playwright-core');
const base = process.env.NOAH_TEST_URL || 'http://127.0.0.1:5198';
const output = process.env.NOAH_TEST_OUTPUT;
if (!output) throw Error('NOAH_TEST_OUTPUT is required');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.NOAH_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = [];
const contact = { name: 'Synthetic Person', email: 'synthetic@example.test', phone: '+14155550123', address: '123 Example Street' };
async function filledContact(page, prefix) {
  const values={};
  for(const key of Object.keys(contact)) {
    values[key]=await page.locator(`#${prefix}${key}`).inputValue();
    assert.equal(key==='phone'?values[key].replace(/\D/g,''):values[key],key==='phone'?contact[key].replace(/\D/g,''):contact[key]);
  }
  return values;
}
async function autofill(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Autofill.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { node } = await cdp.send('DOM.describeNode', { nodeId });
  await cdp.send('Autofill.trigger', { fieldId: node.backendNodeId, address: { fields: [
    { name: 'NAME_FULL', value: contact.name }, { name: 'EMAIL_ADDRESS', value: contact.email },
    { name: 'PHONE_HOME_WHOLE_NUMBER', value: contact.phone }, { name: 'ADDRESS_HOME_STREET_ADDRESS', value: contact.address },
    { name: 'ADDRESS_HOME_COUNTRY', value: 'US' },
  ] } });
  await cdp.detach();
}
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ja-JP' });
    const page = await context.newPage(), errors = [], saves = [], sends = [];
    page.on('pageerror', e => errors.push(e.message));
    let profile = { revision: 1, ownerScope: 'synthetic-owner', available: true, browserOwned: true, fields: {}, reuseEnabled: false, consents: [], documents: [], grants: [], paused: false };
    let profileGate, releaseProfile;
    const provider = { id: 'example', name: '確認用Agent', agentIds: ['autofill-agent'], revision: 1, providerOrigin: 'https://provider.example.com', executorOrigin: 'https://provider.example.com', executorName: '登録担当', termsUrl: 'https://provider.example.com/terms', termsVersion: 'v1', fields: Object.keys(contact).map(key=>({ key: `provider_${key}`, label: key, type: key==='email'?'email':'text', profileField: key, required: true, maxLength: 500 })) };
    await page.route('**/api/**', async route=>{
      const url = new URL(route.request().url()); let body = {};
      if(url.pathname==='/api/noah/session') body={connected:true};
      else if(url.pathname==='/api/noah/profile') {
        if(profileGate) await profileGate;
        if(route.request().method()==='POST') {
          const input=route.request().postDataJSON(); saves.push(input);
          profile={...profile,fields:input.fields,revision:profile.revision+1,reuseEnabled:input.reuse};
        }
        body=profile;
      } else if(url.pathname==='/api/noah/registration') {
        if(route.request().method()==='POST') {const input=route.request().postDataJSON();sends.push(input);body={job:{id:input.id,providerName:provider.name,providerOrigin:provider.providerOrigin,state:'completed',expiresAt:Date.now()+86400000,returnTo:'/noah/ready/agent?id=autofill-agent'}};}
        else body={providers:[provider]};
      } else if(url.pathname==='/api/noah/intake') body={items:[]};
      await route.fulfill({json:body});
    });
    await page.goto(`${base}/noah/profile`);
    await page.locator('summary').filter({hasText:'基本情報'}).click();
    await autofill(page,'#noah-profile-name');
    const filledProfile=await filledContact(page,'noah-profile-');
    await page.getByRole('button',{name:'同意して保存',exact:true}).click();
    await page.getByText('保存済み',{exact:true}).waitFor();
    assert.equal(saves.length,1);
    for(const key of Object.keys(contact)) assert.equal(profile.fields[key],filledProfile[key],`profile ${key}`);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${output}/profile-${width}.png`,fullPage:true});
    profileGate=new Promise(resolve=>{releaseProfile=resolve;});
    await page.goto(`${base}/noah/registration?agent=autofill-agent`);
    await page.getByText('保存情報を読み込んでいます…',{exact:true}).waitFor();
    assert.equal(await page.locator('main input').count(),0);
    releaseProfile();profileGate=null;
    await page.getByRole('heading',{name:'入力は、もうできています。'}).waitFor();
    assert.equal(await page.locator('main input').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${output}/registration-${sends.length}-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'同意して登録・続ける'}).click();
    await page.getByRole('link',{name:'Agentへ戻って続ける'}).waitFor();
    assert.equal(saves.length,1);assert.equal(sends.length,1);
    assert.deepEqual(sends[0].values,{});assert.deepEqual(sends[0].profile.fields,Object.keys(contact).map(key=>`provider_${key}`));
    await page.evaluate(()=>sessionStorage.clear());
    profile={...profile,fields:{},reuseEnabled:false};
    await page.goto(`${base}/noah/registration?agent=autofill-agent`);
    await page.locator('#noah-registration-provider_name').waitFor();
    await autofill(page,'#noah-registration-provider_name');
    const filledRegistration=await filledContact(page,'noah-registration-provider_');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${output}/registration-${sends.length}-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'同意して登録・続ける'}).click();
    await page.getByRole('link',{name:'Agentへ戻って続ける'}).waitFor();
    assert.equal(saves.length,2);assert.equal(sends.length,2);
    for(const key of Object.keys(contact)) assert.equal(profile.fields[key],filledRegistration[key],`registration ${key}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    report.push({width,nativeAutofills:2,saves:saves.length,registrationSends:sends.length,errors});
    await context.close();
  }
} finally { await browser.close(); await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n'); }
console.log(JSON.stringify(report));
