import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegistrationAccountStates} from '../lib/noah-registration-availability.ts';
import {noahDelivery} from '../lib/noah-output-receipt.ts';
import {noahWorkGroups,noahWorkState} from '../lib/noah-work-view.ts';
import {noahOperationLabel,noahChoiceLabel} from '../lib/noah-operation-labels.ts';
import {noahTranslate,NOAH_LOCALES} from '../lib/noah-i18n.ts';
import {screen} from './fixtures/noah/screen.mjs';
const provider={id:'agentboard',requiresAccount:true};
void test('durable registration availability is owner-bound, private and fail-closed',async()=>{
 const accounts={alice:{state:'ready',credential:'private-secret',externalId:'private-id'},bob:{state:'registering'},failed:{state:'failed'}};
 const reads=[];
 const read=createRegistrationAccountStates({authenticate:async r=>{const owner=r.headers.get('user');if(!owner)throw Error('401');return owner;},store:{load:async(owner,id)=>{reads.push([owner,id]);if(owner==='broken')throw Error('unavailable');return {account:accounts[owner]??null};}}});
 const request=user=>new Request('https://example.com',{headers:user?{user}:{}});
 assert.deepEqual(await read(request('alice'),[provider]),{agentboard:'ready'});
 assert.deepEqual(await read(request('bob'),[provider]),{agentboard:'pending'});
 for(const owner of ['other','failed'])assert.deepEqual(await read(request(owner),[provider]),{});
 assert.deepEqual(await read(request('broken'),[provider]),{agentboard:'unavailable'});
 const count=reads.length;assert.deepEqual(await read(request(),[provider]),{});assert.equal(reads.length,count);
 assert.doesNotMatch(JSON.stringify(await read(request('alice'),[provider])),/private-/);
 assert.deepEqual(await read(request('alice'),[{...provider,execution:'browser'}]),{agentboard:'unavailable'});
});
void test('widget prose is not an image; explicit public images are accepted without guessing',()=>{
 const result={text:'The widget above shows six styles; do not redraw.',truncated:false,attachments:1};
 assert.equal(noahDelivery('arabickeyboard.ai','write_name_in_arabic',result),'missing_image');
 assert.equal(noahDelivery('other.example','write_name_in_arabic',result),undefined);
 assert.equal(noahDelivery('arabickeyboard.ai','write_name_in_arabic',{...result,imageUrls:['https://example.com/output.png']}),undefined);
 assert.equal(noahDelivery('arabickeyboard.ai','write_name_in_arabic',{...result,imageUrls:['https://localhost/output.png']}),'missing_image');
 assert.equal(noahDelivery('arabickeyboard.ai','write_name_in_arabic',{...result,images:[{name:'fake.png',mimeType:'image/png',data:'YWJj'}]}),'missing_image');
 const ask={id:'old-image',state:'succeeded',finishedAt:1,delivery:'missing_image'};
 assert.equal(noahWorkState(ask),'画像が未受取');assert.equal(noahWorkGroups([ask])[0].label,'確認待ち');
 assert.equal(noahWorkState({state:'succeeded'}),'応答を受信');
});
void test('purpose labels translate in all six languages without changing API values',()=>{
 for(const locale of NOAH_LOCALES){const label=noahTranslate(locale,noahOperationLabel('search_gta6_guide'));assert.ok(label);assert.doesNotMatch(label,/search_gta6_guide/);if(locale!=='ja')assert.notEqual(label,'ゲーム情報を調べる');}
 assert.equal(noahChoiceLabel('character'),'人物');assert.equal(noahChoiceLabel('provider-custom'),'provider-custom');
});
void test('home and timeline select different content from the current hash',()=>{
 let hash='';
 const ui=screen({modules:{'./noah-surface-context':{useNoahSurface:()=>({hash})},'./noah-pin-home':{default:()=>({type:'main',props:{children:'PIN HOME'}})},'./noah-timeline':{default:()=>({type:'main',props:{children:'POST TIMELINE'}})}}});
 assert.equal(ui.mount('components/noah-home.tsx').text(),'PIN HOME');
 for(const value of ['#timeline','#following','#agents']){hash=value;assert.equal(ui.mount('components/noah-home.tsx').text(),'POST TIMELINE');}
 hash='';assert.equal(ui.mount('components/noah-home.tsx').text(),'PIN HOME');
});
