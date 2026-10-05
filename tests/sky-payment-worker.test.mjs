import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

void test('50-yen Checkout runs in workerd and rejects redirects without forwarding credentials', async () => {
  const bundled = await build({
    stdin: {
      contents: `import { skyStripe } from './lib/sky-stripe.ts';
        export default { async fetch(request) {
          let calls = 0; let redirect; let amount; let adaptivePricing;
          const client = skyStripe({mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_fixture',origin:'https://sky.example'},
            async (url, init) => {
              calls++; const outgoing = new Request(url, init);
              redirect = outgoing.redirect;
              const fields = new URLSearchParams(await outgoing.text());
              amount = fields.get('line_items[0][price_data][unit_amount]');
              adaptivePricing = fields.get('adaptive_pricing[enabled]');
              if (new URL(request.url).pathname === '/redirect') return new Response(null,{status:302,headers:{Location:'https://other.example'}});
              return Response.json({id:'cs_test_fixture',url:'https://checkout.stripe.com/c/pay/cs_test_fixture'});
            });
          try { await client.createCsvTrialCheckout('00000000-0000-4000-8000-000000000001','fixture:trial');
            return Response.json({calls,redirect,amount,adaptivePricing,ok:true});
          } catch(error) {return Response.json({calls,redirect,amount,adaptivePricing,ok:false,status:error.status});}
        }};`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'browser', write: false,
  });
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-08-01', script: bundled.outputFiles[0].text,
  }));
  try {
    assert.deepEqual(await (await worker.dispatchFetch('https://fixture.example/success')).json(), {
      calls: 1, redirect: 'manual', amount: '50', adaptivePricing: 'false', ok: true,
    });
    assert.deepEqual(await (await worker.dispatchFetch('https://fixture.example/redirect')).json(), {
      calls: 1, redirect: 'manual', amount: '50', adaptivePricing: 'false', ok: false, status: 502,
    });
  } finally { await worker.dispose(); }
});
