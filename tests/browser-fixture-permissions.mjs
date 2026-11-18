/** Restrict grants to the disposable loopback fixture; never alter the user's profile. */
export async function grantFixturePermissions(devtools, port, origin) {
  if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Fixture origin must be loopback');
  const response = await fetch(`http://127.0.0.1:${port}/json/protocol`);
  if (!response.ok) throw new Error('Cannot inspect fixture browser protocol');
  const protocol = await response.json();
  const supported = protocol.domains.find(d => d.domain === 'Browser')?.types.find(t => t.id === 'PermissionType')?.enum ?? [];
  // grantPermissions denies every omitted permission. Chrome's local-network
  // permission must stay granted when durable storage is enabled for the journal.
  const permissions = ['durableStorage', ...['localNetworkAccess', 'localNetwork', 'loopbackNetwork'].filter(p => supported.includes(p))];
  await devtools.call('Browser.grantPermissions', { origin, permissions });
}
