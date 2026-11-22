import test from 'node:test';
import assert from 'node:assert/strict';
import * as surface from '../lib/noah-surface.ts';
import { screen } from './fixtures/noah/screen.mjs';

void test('home search preserves the selected source and defaults to connectable Agents', async () => {
  for (const source of [undefined,'noah','github','']) {
    const ui=screen({search:source===undefined?'':`?collectionSource=${source}`,modules:{'next/navigation':{usePathname:()=>'/noah'},'@/lib/noah-surface':surface}});
    const page=ui.mount('components/noah-shell.tsx',{mode:'public',children:null});
    // FormData is provided by the browser; test the submitted form with a compatible constructor.
    page.find('form')[0].props.onSubmit({preventDefault(){},currentTarget:{values:{q:'BeevR'}}});
    const url=new URL(ui.visits.at(-1),'https://avoado.si');
    assert.equal(url.pathname,'/noah/explore');assert.equal(url.searchParams.get('collectionSource'),source??'noah');assert.equal(url.searchParams.get('q'),'BeevR');
    assert.equal(url.searchParams.has('tab'),false);
  }
});
void test('discovery starts with connectable Agents and uses one result feed',async()=>{
  const ui=screen({modules:{'./noah-pin-grid':{default:()=>null},'./sky-workspace':{default:()=>null}},fetch:async()=>({body:{items:[],total:0,nextCursor:null,ownerScope:null}})});
  const page=ui.mount('components/noah-explore.tsx',{initialQuery:'BeevR'});await page.flush();
  assert.equal(page.find('input').length,1);
  assert.ok(ui.calls.length>0);assert.ok(ui.calls.every(c=>c.url.includes('/api/noah/discover?')));
  assert.equal(new URL(ui.calls.at(-1).url,'https://avoado.si').searchParams.get('source'),'noah');
  await page.click('すべて');await page.flush();
  assert.equal(new URL(ui.calls.at(-1).url,'https://avoado.si').searchParams.get('source'),'');
  await page.type('another');await page.flush();
  const changed=new URL(ui.calls.at(-1).url,'https://avoado.si');assert.equal(changed.searchParams.get('source'),'');assert.equal(changed.searchParams.get('q'),'another');
});
