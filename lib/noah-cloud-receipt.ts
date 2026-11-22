/** Opaque routing envelope: the runtime does not need the browser's owner identity. */
async function key(secret: string) {
  if (secret.length < 32) throw Error('NOAH_CLOUD_KEY_REQUIRED');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
type Ticket = { owner: string; project: string; jobId: string; inputHash: string };
export async function noahCloudReceipt(secret: string, value: Ticket) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('noah-cloud-receipt-v1') }, await key(secret), new TextEncoder().encode(JSON.stringify(value))));
  return btoa(String.fromCharCode(...iv, ...cipher)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function readNoahCloudReceipt(secret: string, ticket: unknown): Promise<Ticket> {
  if (typeof ticket !== 'string' || !/^[\w-]{40,2048}$/.test(ticket)) throw Error('INVALID_RECEIPT');
  const bytes = Uint8Array.from(atob(ticket.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const value = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode('noah-cloud-receipt-v1') }, await key(secret), bytes.slice(12))));
  if (!value || typeof value.owner !== 'string' || value.owner.length > 256 || typeof value.project !== 'string' || typeof value.jobId !== 'string' || typeof value.inputHash !== 'string') throw Error('INVALID_RECEIPT');
  return value;
}
