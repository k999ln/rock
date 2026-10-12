/** Verify only the signature; each A2A contract owns trust and signed fields. */
export async function verifyA2AProviderSignature(
  publicKey: Uint8Array,
  signed: { signature: string },
  signingBytes: () => Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw', Uint8Array.from(publicKey).buffer as ArrayBuffer,
      { name: 'Ed25519' }, false, ['verify'],
    );
    const signature = Uint8Array.from(
      atob(signed.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='),
      (character) => character.charCodeAt(0),
    );
    if (signature.length !== 64 ||
      btoa(String.fromCharCode(...signature)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== signed.signature)
      return false;
    // Keep byte generation after key import and canonical signature validation,
    // inside the same failure boundary as the original contract verifiers.
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, signingBytes());
  } catch { return false; }
}
