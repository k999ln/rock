const $ = (id) => document.getElementById(id);
const validScreens = new Set(['home','eve','work','network','settings']);
let activeScreen = '';
function navigate() {
 const target = location.hash.slice(1);
 const screen = validScreens.has(target) ? target : 'home';
 document.querySelectorAll('[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== screen; });
 document.querySelectorAll('[data-nav]').forEach(el => { if (el.dataset.nav === screen) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
 if (activeScreen && activeScreen !== screen) $('screen').focus({preventScroll:true});
 activeScreen = screen;
}
window.addEventListener('hashchange', navigate); navigate();
function tick() {
 const date = new Date();
 $('clock').textContent = date.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
 $('clock').dateTime = date.toISOString();
 $('calendar').textContent = date.toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'});
}
tick(); setInterval(tick,10000);
function connection() {
 const online = navigator.onLine;
 $('browser-status').textContent = online ? 'ブラウザ：オンライン申告' : 'ブラウザ：オフライン申告';
 $('network-detail').textContent = online ? 'オンライン申告' : 'オフライン申告';
}
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
let noticeTimer;
function notice(text) { clearTimeout(noticeTimer); $('notice').textContent = text; noticeTimer = setTimeout(()=>{$('notice').textContent='';},6000); }
function count() { $('draft-count').textContent = `${$('eve-input').value.length} / 4000`; }
function prepare(text) { $('eve-input').value = text.slice(0,4000); count(); location.hash = 'eve'; requestAnimationFrame(()=>$('eve-input').focus()); }
$('home-form').addEventListener('submit',event=>{event.preventDefault(); const value=$('home-input').value.trim(); if(value)prepare(value);else $('home-input').focus();});
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>prepare(button.dataset.prompt)));
$('eve-input').addEventListener('input',count);
$('clear-draft').addEventListener('click',()=>{$('eve-input').value='';count();$('eve-input').focus();});
$('copy-draft').addEventListener('click',async()=>{
 const text=$('eve-input').value.trim();if(!text){notice('依頼文を入力してください。');$('eve-input').focus();return;}
 try {await navigator.clipboard.writeText(text);notice('コピーしました。本人のEveで貼り付けて確認してください。');}
 catch { $('eve-input').focus();$('eve-input').select();notice('コピーできませんでした。選択した文章を手動でコピーしてください。'); }
});
const shell=document.querySelector('.mini-shell');
$('brightness').addEventListener('input',()=>{const value=Math.max(65,Math.min(100,Number($('brightness').value)));shell.style.filter=`brightness(${value/100})`;$('brightness-value').textContent=`${value}%`;});
let previousFocus;
function rest() {previousFocus=document.activeElement;shell.inert=true;$('rest-overlay').hidden=false;$('wake-button').focus();}
function wake() {$('rest-overlay').hidden=true;shell.inert=false;previousFocus?.focus();}
$('rest-button').addEventListener('click',rest);$('settings-rest').addEventListener('click',rest);$('wake-button').addEventListener('click',wake);
document.addEventListener('keydown',event=>{if(!$('rest-overlay').hidden){if(event.key==='Escape'){event.preventDefault();wake();}if(event.key==='Tab'){event.preventDefault();$('wake-button').focus();}}});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('このブラウザは全画面表示に対応していません。');}catch{notice('全画面表示に切り替えられませんでした。');}});
