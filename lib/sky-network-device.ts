import { detectSkyHost } from './sky-tool-compatibility.ts';

/** Display hints only. Browser detection never grants device or purchase rights. */
export function networkDeviceHint(userAgent: string, maxTouchPoints = 0) {
  const host = detectSkyHost(userAgent, maxTouchPoints);
  const mobile = host === 'ios' || host === 'android';
  const names = {macos:'Mac',windows:'Windows PC',linux:'Linux PC',ios:/ipad/i.test(userAgent) || /macintosh/i.test(userAgent) ? 'iPad' : 'iPhone',android:/mobile/i.test(userAgent)?'Androidスマートフォン':'Android端末',unknown:'端末'};
  return {host,mobile,name:names[host],desktop:host==='macos'||host==='windows'||host==='linux',
    connectorHint: mobile ? 'この端末ではブラウザのツールを使えます。PCのツールは、使いたいPCから接続してください。' : host==='unknown' ? 'ブラウザのツールはそのまま使えます。PCの場合は接続を確認できます。' : 'このPCのツールも使うなら、一度接続するだけ。次からは接続状態を確認します。'};
}
