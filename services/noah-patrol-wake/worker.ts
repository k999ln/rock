// Noah の巡回を起こす合図。毎分、署名つきの空の本文だけを Web の本体へ送る。
// 利用者の情報・依頼・モデルの鍵・接続先を持たない。HTTP の入口も無い。何を読むか・どこへつなぐかは、Web の本体だけが決める。
const PATH = '/api/noah/intake/tick';
const worker = {
  async scheduled(_event: ScheduledController, env: { NOAH_PATROL_WAKE_KEY: string; NOAH_ORIGIN: string }) {
    const origin = new URL(env.NOAH_ORIGIN);
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw Error('NOAH_ORIGIN must be an https origin');
    const timestamp = String(Date.now());
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.NOAH_PATROL_WAKE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}\nPOST\n${PATH}\n{}`));
    const signature = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const response = await fetch(origin.origin + PATH, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'x-noah-time': timestamp, 'x-noah-signature': signature },
      body: '{}',
      signal: AbortSignal.timeout(55_000),
    });
    // 失敗は、この実行の失敗として残す（成功に見せない）。
    if (!response.ok) throw Error(`Noah patrol wake HTTP ${response.status}`);
    console.log(JSON.stringify(await response.json()));
  },
};
export default worker;
