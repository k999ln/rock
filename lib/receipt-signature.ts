const encoder = new TextEncoder();

function bytesFromHex(value: string) {
  if (!/^[0-9a-f]{64}$/iu.test(value))
    throw new Error('RECEIPT_SIGNATURE_INVALID');
  return Uint8Array.from({ length: value.length / 2 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  );
}

function hexFromBytes(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function secureEqual(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

async function signingKey(secret: string) {
  if (secret.length < 32) throw new Error('RECEIPT_SIGNATURE_INVALID');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function createReceiptSignature(
  rawBody: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    throw new Error('RECEIPT_SIGNATURE_INVALID');
  const digest = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return `t=${timestamp},v1=${hexFromBytes(digest)}`;
}

export async function verifyReceiptSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
) {
  if (!signatureHeader || secret.length < 32)
    throw new Error('RECEIPT_SIGNATURE_INVALID');
  const fields = signatureHeader.split(',').map((field) => field.split('='));
  const timestampValue = fields.find(([key]) => key === 't')?.[1];
  const candidates = fields
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > toleranceSeconds ||
    candidates.length === 0
  )
    throw new Error('RECEIPT_SIGNATURE_INVALID');
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await signingKey(secret),
      encoder.encode(`${timestamp}.${rawBody}`),
    ),
  );
  if (
    !candidates.some((candidate) => {
      try {
        return secureEqual(bytesFromHex(candidate), expected);
      } catch {
        return false;
      }
    })
  )
    throw new Error('RECEIPT_SIGNATURE_INVALID');
}
