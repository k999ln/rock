// Public utility: no account, customer identity, or stored private input.
export async function GET(request: Request) {
  const target = new URL('https://noah-business-si.mr-kirin999.workers.dev/');
  const campaign = new URL(request.url).searchParams.get('campaign');
  target.searchParams.set('campaign', campaign && /^[a-z0-9][a-z0-9.-]{0,49}$/.test(campaign) ? campaign : 'noah-home');
  return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
