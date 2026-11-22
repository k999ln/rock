import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Agent, fetch as request } from 'undici';
import { isNoahPrivateAddress } from '../lib/noah-mouth-mcp-remote.ts';
import { remoteMcpUrl } from '../lib/mcp-inspection.ts';

// Block mapped/transition addresses too: an IPv6 spelling must not reach IPv4 localhost.
const special = new BlockList();
for (const [ip, bits] of [['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16], ['2001::', 32]]) special.addSubnet(ip, bits, 'ipv6');
export function collectorPublicAddress(address) {
  const family = isIP(address);
  return family !== 0 && !isNoahPrivateAddress(address) && !(family === 6 && special.check(address, 'ipv6'));
}

// The socket uses these exact checked answers, rather than resolving again after a preflight.
export function collectorLookup(resolve = lookup) {
  return (host, options, callback) => {
    resolve(host, { all: true, order: 'verbatim' }).then(addresses => {
      if (!addresses.length || addresses.some(({ address }) => !collectorPublicAddress(address))) throw Error('collector_address_blocked');
      const family = typeof options === 'number' ? options : options?.family;
      const eligible = family ? addresses.filter(a => a.family === family) : addresses;
      if (!eligible.length) throw Error('collector_address_unavailable');
      if (options?.all) callback(null, eligible);
      else callback(null, eligible[0].address, eligible[0].family);
    }).catch(error => callback(error));
  };
}

export function createCollectorNetwork({ resolve = lookup } = {}) {
  const dispatcher = new Agent({ connections: 2, connect: { lookup: collectorLookup(resolve), timeout: 10_000 }, maxOrigins: 128 });
  return {
    fetch: async (input, init = {}) => {
      const url = remoteMcpUrl(input instanceof Request ? input.url : String(input));
      // No environment credentials, automatic redirects, or proxy dispatchers.
      return request(url, { ...init, redirect: 'manual', credentials: 'omit', dispatcher });
    },
    close: () => dispatcher.destroy(),
  };
}
