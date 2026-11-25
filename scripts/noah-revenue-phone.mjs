import { execFileSync } from 'node:child_process';
import { readJson } from '../toolkits/noah-revenue-pack/runtime.mjs';
const [file,serial]=process.argv.slice(2);
if(!file||!serial)throw Error('Usage: noah-revenue-phone.mjs <mobile-link.json> <adb-device>');
const {origin,pairUrl,expiresAt}=readJson(file),url=new URL(pairUrl);
if(!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)||url.origin!==origin||url.pathname!=='/'||!/^#pair=[a-f0-9]{64}$/.test(url.hash)||expiresAt<Date.now())throw Error('接続リンクが不正または期限切れです。');
const port=new URL(origin).port;
try{
  execFileSync('adb',['-s',serial,'reverse',`tcp:${port}`,`tcp:${port}`],{stdio:'pipe'});
  execFileSync('adb',['-s',serial,'shell','am','start','-a','android.intent.action.VIEW','-d',pairUrl],{stdio:'pipe'});
}catch{console.error('携帯のブラウザを開けませんでした。接続先・ブラウザを確認してください。');process.exit(1);}
console.log(JSON.stringify({opened:true,origin,transport:serial.includes('_adb-tls-connect')?'wifi-adb':'adb',credentialLogged:false}));
