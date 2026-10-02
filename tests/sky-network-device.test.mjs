import test from 'node:test';
import assert from 'node:assert/strict';
import {networkDeviceHint} from '../lib/sky-network-device.ts';
await test('device guidance distinguishes desktop, phones, and iPad desktop mode without granting rights',()=>{
 for(const [ua,touch,name,mobile] of [
 ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',0,'Mac',false],
 ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)',0,'Windows PC',false],
 ['Mozilla/5.0 (X11; Linux x86_64)',0,'Linux PC',false],
 ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',5,'iPhone',true],
 ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',5,'iPad',true],
 ['Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile',5,'Androidスマートフォン',true],
 ['unknown',0,'端末',false]]){
  const h=networkDeviceHint(ua,touch);assert.equal(h.name,name);assert.equal(h.mobile,mobile);assert.equal(h.entitlement,undefined);assert.equal(h.savedProfileLimit,undefined);
 }
});
