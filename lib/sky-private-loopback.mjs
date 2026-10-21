const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function isLocalRuntimeHost(request, port) {
  return LOOPBACK.has(request.socket?.remoteAddress) &&
    ['localhost:' + port, '127.0.0.1:' + port, '[::1]:' + port].includes(request.headers.host);
}
export function isLocalRuntimeRequest(request, port) {
  if (!isLocalRuntimeHost(request, port)) return false;
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || request.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.origin === origin &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.port === String(port) && url.host === request.headers.host;
  } catch { return false; }
}
