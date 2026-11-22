export const distributionRoot = '/api/noah/cloud-work/distribution';
const get = new Map([
  [distributionRoot, 'inbox'],
  [distributionRoot + '/address', 'address'],
  [distributionRoot + '/notice', 'notice'],
]);
const post = new Map([
  [distributionRoot + '/address', 'save-address'],
  [distributionRoot + '/receive', 'receive'],
]);
export function distributionAction(method, path) {
  return (
    (method === 'GET' ? get : method === 'POST' ? post : null)?.get(path) ??
    null
  );
}
