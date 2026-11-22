// Aggregate browser navigation requests only. These are not people, leads or revenue.
export const SITE_DESTINATIONS = Object.freeze({
  'wordpress-maintenance':
    'https://avoado.si/noah/discover/agent?id=project-5726816eeed9c2c6b2abca889276d006d9889ca08e6a70497498285232d6cdfa',
  'ec-production':
    'https://avoado.si/noah/discover/agent?id=project-6e75d814263ee194a1626dc0346e891c5b74d31849db1ea81091cebad032df70',
});
export function acquisitionSource(value) {
  return ['blog', 'x'].includes(value) ? value : 'other';
}
export function isAcquisitionNavigation(request) {
  return (
    request.method === 'GET' &&
    request.headers.get('sec-fetch-mode') === 'navigate' &&
    request.headers.get('sec-fetch-user') === '?1' &&
    !request.headers.get('purpose') &&
    !request.headers.get('sec-purpose')
  );
}
export function recordAcquisition(rows = [], id, source, now = Date.now()) {
  if (!Object.hasOwn(SITE_DESTINATIONS, id))
    throw Error('Unknown acquisition destination');
  const date = new Date(now).toISOString().slice(0, 10);
  const cutoff = new Date(now - 29 * 86400000).toISOString().slice(0, 10);
  const next = rows
    .filter((r) => r.date >= cutoff && r.date <= date)
    .map((r) => ({ ...r }));
  source = acquisitionSource(source);
  const row = next.find(
    (r) => r.date === date && r.schemeId === id && r.source === source,
  );
  if (row)
    row.navigationRequests = Math.min(row.navigationRequests + 1, 1000000);
  else next.push({ date, schemeId: id, source, navigationRequests: 1 });
  return next;
}
export function acquisitionReport(rows = [], now = Date.now()) {
  const cutoff = new Date(now - 29 * 86400000).toISOString().slice(0, 10);
  return {
    measurement: 'browser_navigation_requests_not_unique_people_or_conversions',
    attribution: 'aggregate_only_no_user_or_order_join',
    retentionDays: 30,
    rows: rows.filter((r) => r.date >= cutoff),
  };
}
