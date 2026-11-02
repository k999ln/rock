// Local Worker fixture only. Never use synthetic identity headers against a public site.
import { rockstarDeviceLinkStore } from '../lib/rockstar-device-link.ts';

export async function checkLegacyDeviceBindingApi({ call, check, database }) {
  const path = '/api/rockstar/device-authorizations', approval = path + '/approve', sessions = '/api/rockstar/device-sessions';
  const before = await call('GET', undefined, { path: sessions });
  const authorization = await call('POST', { action: 'begin', deviceName: 'Synthetic legacy Android' }, { path, user: null, status: 201 });
  check(Object.keys(authorization).sort(), ['deviceCode', 'userCode', 'expiresIn', 'interval', 'verificationUri', 'verificationUriComplete'].sort());
  await call('POST', { action: 'approve', userCode: authorization.userCode }, { path: approval });
  const grant = await call('POST', { action: 'poll', deviceCode: authorization.deviceCode }, { path, user: null });
  check(Object.keys(grant).sort(), ['status', 'accessToken', 'expiresAt', 'ownerUserId'].sort());
  check(grant.status, 'authorized');
  const identity = await rockstarDeviceLinkStore(database).identity(grant.accessToken);
  check(identity.userId, grant.ownerUserId);
  await call('DELETE', { id: identity.id }, { path: sessions });
  check((await call('GET', undefined, { path: sessions })).sessions, before.sessions);
  check(await call('POST', { action: 'poll', deviceCode: authorization.deviceCode }, { path, user: null }), { status: 'access_denied' });
  const denied = await call('POST', { action: 'begin', deviceName: 'Synthetic denied legacy' }, { path, user: null, status: 201 });
  await call('POST', { action: 'deny', userCode: denied.userCode }, { path: approval });
  check(await call('POST', { action: 'poll', deviceCode: denied.deviceCode }, { path, user: null }), { status: 'access_denied' });
  const count = await database.prepare('SELECT COUNT(*) AS n FROM rockstar_device_authorizations').first();
  await call('POST', { action: 'begin', deviceName: 'Rejected binding' }, { path, user: null, status: 400, headers: { 'X-Rockstar-Device-Binding': 'owner-device/v2' } });
  check(await database.prepare('SELECT COUNT(*) AS n FROM rockstar_device_authorizations').first(), count);
}
