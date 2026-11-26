import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNoahMarketplaceDirectory } from '../lib/noah-marketplace-directory.ts';
import { noahMarketplaceHref } from '../lib/noah-marketplace-view.ts';
import { noahCardIdentity, selectNoahDirectory } from '../lib/noah-agent-directory.ts';
import { noahCardHref } from '../lib/noah-project-view.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { catalog } from '../lib/catalog.ts';
import { skyAiMarketplaceEntries } from '../lib/sky-ai-marketplace.ts';
import { screen } from './fixtures/noah/screen.mjs';
import * as compatibility from '../lib/sky-tool-compatibility.ts';
import * as packageView from '../lib/noah-agent-package-view.ts';
import { includedRockstarServicePackageKeys } from '../lib/rockstar-service-package-access.ts';

const source = 'https://github.com/example/memo';
function item(name = 'Memo Agent', time = 100) {
  const manifest = createSkyToolPackageDraft({ name, sourceKind:'github', sourceUrl:source, developerId:'publisher', developerName:'Publisher', license:'MIT' });
  manifest.id = name.toLowerCase().replaceAll(' ', '-');
  return { packageKey: `${manifest.id}@${time}`, manifest, manifestSha256:'a'.repeat(64), status:'verified', installable:true, createdAt:time, publishedAt:time };
}
void test('one directory includes the full old catalog and models; only reviewed packages survive', async () => {
  const oldest=item(), newest=item('Memo Agent',200), revoked={...item('Revoked'),status:'revoked'}, expired={...item('Expired'),installable:false};
  const rows = await mergeNoahMarketplaceDirectory([], [oldest,revoked,newest,expired]);
  assert.equal(rows.length,catalog.length+skyAiMarketplaceEntries.length+1);
  assert.equal(rows.filter(row=>row.card.marketplace.kind==='package').length,1);
  const found=selectNoahDirectory(rows,'','Memo Agent');
  assert.equal(found.length,1);assert.equal(found[0].card.marketplace.key,newest.packageKey);
  assert.equal(noahCardHref(found[0].card),'/noah?package=memo-agent%40200');
  const selected = new URL(noahCardHref(found[0].card,{q:'Memo',collectionTopic:'work'}),'https://avoado.si');
  assert.equal(selected.searchParams.get('q'),'Memo');assert.equal(selected.searchParams.get('collectionTopic'),'work');
  assert.ok(rows.every(row=>row.families.length===0 && row.card.oneTap===false));
  assert.ok(rows.filter(row=>row.card.marketplace.kind==='tool').every(row=>noahCardHref(row.card).startsWith('/noah/tools/')));
});
void test('exact single distribution merges purchase into one existing card without losing saves or identity', async () => {
  const id=await noahCardIdentity(source,''), original={families:['family'],observedAt:50,card:{id:'family',feedbackId:id,name:'Memo',provider:'Publisher',summary:'existing',savedIn:['board'],topic:'work',shape:0}};
  const rows=await mergeNoahMarketplaceDirectory([original],[item()]);
  const row=rows.find(row=>row.card.feedbackId===id);
  assert.deepEqual(row.families,['family']);assert.deepEqual(row.card.savedIn,['board']);
  assert.equal(row.card.marketplace.key,item().packageKey);
  assert.equal(rows.filter(row=>row.card.marketplace.kind==='package').length,1);
  assert.equal(original.card.marketplace,undefined,'input is not mutated');
  const shared=await mergeNoahMarketplaceDirectory([original],[item(),item('Other Agent')]);
  assert.equal(shared.filter(row=>row.card.marketplace?.kind==='package').length,2,'shared repository cannot collapse distinct tools');
  assert.equal(shared.find(row=>row.card.feedbackId===id).card.marketplace,undefined);
});
void test('legacy entry keeps selected package, model and search but cannot redirect offsite', () => {
  assert.equal(noahMarketplaceHref(),'/noah');
  const url=new URL(noahMarketplaceHref({package:['memo@1','ignored'],q:'memo',returnTo:'https://evil.test'}),'https://avoado.si');
  assert.equal(url.pathname,'/noah');assert.equal(url.searchParams.get('package'),'memo@1');assert.equal(url.searchParams.get('q'),'memo');assert.equal(url.searchParams.has('returnTo'),false);
  assert.equal(new URL(noahMarketplaceHref({package:'https://evil.test'}),'https://avoado.si').origin,'https://avoado.si');
});
void test('timeline renders the package within its single grid and opens existing purchase detail lazily', async () => {
  const rows=await mergeNoahMarketplaceDirectory([],[item()]), card=rows.find(row=>row.card.marketplace.kind==='package').card;
  const ui=screen({search:'?package='+encodeURIComponent(card.marketplace.key)+'&model=openai',fetch:async()=>({body:{items:[card],nextCursor:null,ownerScope:null,total:1}})});
  const page=ui.mount('components/noah-home.tsx',{mode:'public'});await page.flush();
  assert.equal(page.find('ul').filter(node=>node.props['data-agent-pin-grid']).length,1);
  assert.equal(page.find('a', 'Agentを買う').length,0);
  assert.equal(page.find('a', '購入履歴').length,1);
  const overlay=page.find('dynamic-component')[0];assert.equal(overlay.props.initialPackageKey,card.marketplace.key);assert.equal(overlay.props.detailsOnly,true);assert.equal(overlay.props.initialModel,null,'a package link takes priority over a conflicting model selection');
  assert.ok(ui.calls.every(call=>call.method==='GET' && call.url.startsWith('/api/noah/discover?')));
});
function detailScreen(packages, entitlementStatus=401) {
  return screen({navigator:{userAgent:'Macintosh',maxTouchPoints:0},modules:{
    '@/lib/catalog':{catalog:[]}, '@/lib/noah-agent-package-view':packageView,
    '@/lib/sky-tool-compatibility':compatibility, '@/lib/sky-tool-ui':{},
    '@/lib/use-sky-tool-context':{useSkyToolContext:()=>({})},
    '@/lib/sky-ai-marketplace':{skyAiMarketplaceEntries:[]},
    '@/lib/rockstar-service-package-access':{includedRockstarServicePackageKeys},
    '@/components/sky-tool-card':{default:()=>null}, '@/components/sky-tool-overview':{default:()=>null},
    '@/components/workspace-shell':{default:'main'},
    '@/lib/sky-citation-agent':{SKY_CITATION_AGENT_ID:'citations'},
    '@/components/ui/dialog':{Dialog:({open,children})=>open?children:null,DialogTitle:'h2',DialogDescription:'p',DialogContent:'dialog'},
    '@/components/sky-commerce':{CommerceNavigation:()=>null,MarketplacePurchase:'purchase',commerceAmount:()=> '300円',usePublicCommerceOffers:()=>({data:{configured:true,mode:'test',offers:[{packageKey:item().packageKey}]}})},
  },fetch:async({url})=>url==='/api/sky/tool-registry'?{body:{packages}}:{status:entitlementStatus}});
}
void test('home detail keeps purchase gates, excludes the second list, and never buys on open',async()=>{
  for(const status of [401,503]) {
    const ui=detailScreen([item()],status),page=ui.mount('components/sky-marketplace.tsx',{initialPackageKey:item().packageKey,detailsOnly:true});await page.flush();
    assert.equal(page.find('main').length,0);assert.equal(page.find('ul').length,0);
    assert.equal(page.find('dialog').length,1);assert.equal(page.find('purchase').length,status===401?1:0);
    if(status===503)assert.match(page.text(),/購入を保留/);
    assert.ok(ui.calls.every(call=>call.method==='GET'));
  }
  const ui=detailScreen([{...item(),status:'revoked'}]),page=ui.mount('components/sky-marketplace.tsx',{initialPackageKey:item().packageKey,detailsOnly:true});await page.flush();
  assert.equal(page.find('purchase').length,0);assert.match(page.text(),/現在の公開一覧にありません/);
});
