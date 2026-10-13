const COLUMBIA_CAMPUS_URL =
  'https://rockstaros-kaiya.noellesugar1.chatgpt.site/campus?campus=columbia';

function columbiaCampusUrl(request: Request) {
  const source = new URL(request.url);
  const destination = new URL(COLUMBIA_CAMPUS_URL);
  for (const [key, value] of source.searchParams) {
    if (key !== 'campus') destination.searchParams.append(key, value);
  }
  return destination;
}

function campusRedirect(request: Request) {
  return new Response(null, {
    status: 302,
    headers: {
      location: columbiaCampusUrl(request).toString(),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function GET(request: Request) {
  return campusRedirect(request);
}

export function HEAD(request: Request) {
  return campusRedirect(request);
}
