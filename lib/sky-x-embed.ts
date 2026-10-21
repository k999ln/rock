import { xTimelineUrl } from './sky-hub.ts';
export function xWidgetChannel(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{24,64}$/.test(value)) throw new Error('INVALID_WIDGET_CHANNEL');
  return value;
}
export function xTimelineWidgetUrl(source: string, channel: string) {
  return `/api/sky/x-widget?${new URLSearchParams({ source: xTimelineUrl(source), channel: xWidgetChannel(channel) })}`;
}
/** Public document: sandbox without allow-same-origin, never include account data. */
export function xTimelineWidgetDocument(source: string, channel: string, nonce: string) {
  const url = new URL(xTimelineUrl(source));
  const dataSource = url.pathname.startsWith('/i/lists/')
    ? { sourceType: 'list', id: url.pathname.split('/').pop() }
    : { sourceType: 'profile', screenName: url.pathname.slice(1) };
  xWidgetChannel(channel); xWidgetChannel(nonce);
  const csp = `default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'nonce-${nonce}' https://platform.twitter.com; connect-src https://syndication.twitter.com https://platform.twitter.com; frame-src https://syndication.twitter.com https://platform.twitter.com https://twitter.com https://x.com; img-src https://*.twimg.com data:; style-src 'unsafe-inline'`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="twitter:dnt" content="on"><meta name="viewport" content="width=device-width,initial-scale=1"><title>X公開投稿</title><style>body{margin:0;background:#fff;color:#303832;font:14px system-ui}#timeline{min-height:80px}</style></head><body><div id="timeline"></div><script nonce="${nonce}">
const channel=${JSON.stringify(channel)},source=${JSON.stringify(dataSource)};
let finished=false;
function report(status){if(finished)return;finished=true;parent.postMessage({type:'sky-x-widget',channel,status},'*');}
parent.postMessage({type:'sky-x-widget',channel,status:'started'},'*');
const timeout=setTimeout(()=>report('unavailable'),20000);
function start(){parent.postMessage({type:'sky-x-widget',channel,status:'sdk-loaded'},'*');if(!window.twttr?.widgets){report('unavailable');return;}
window.twttr.widgets.createTimeline(source,document.getElementById('timeline'),{dnt:true,lang:'ja',theme:'light',height:560}).then(widget=>{clearTimeout(timeout);report(widget?'ready':'unavailable');}).catch(()=>{clearTimeout(timeout);report('unavailable');});}
const sdk=document.createElement('script');sdk.src='https://platform.twitter.com/widgets.js';sdk.async=true;sdk.nonce=${JSON.stringify(nonce)};sdk.onload=start;sdk.onerror=()=>report('unavailable');document.head.appendChild(sdk);
</script></body></html>`;
  return { csp, html };
}
