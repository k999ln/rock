function bytes(value: string) {
  return Uint8Array.from(
    atob(
      value.replaceAll('-', '+').replaceAll('_', '/') +
        '='.repeat((4 - (value.length % 4)) % 4),
    ),
    (x) => x.charCodeAt(0),
  );
}
function encoded(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export async function createPasskey(options: Record<string, unknown>) {
  const user = options.user as Record<string, unknown>;
  const key = (await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: bytes(options.challenge as string),
      user: { ...user, id: bytes(user.id as string) },
      excludeCredentials: (
        (options.excludeCredentials ?? []) as Array<Record<string, unknown>>
      ).map((c) => ({ ...c, id: bytes(c.id as string) })),
    } as unknown as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;
  if (!key) throw new Error('PASSKEY_CANCELLED');
  const response = key.response as AuthenticatorAttestationResponse;
  return {
    id: key.id,
    rawId: encoded(key.rawId),
    type: key.type,
    clientExtensionResults: key.getClientExtensionResults(),
    response: {
      clientDataJSON: encoded(response.clientDataJSON),
      attestationObject: encoded(response.attestationObject),
      transports: response.getTransports(),
    },
  };
}
export async function getPasskeyAssertion(options: Record<string, unknown>) {
  const key = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: bytes(options.challenge as string),
      allowCredentials: (
        (options.allowCredentials ?? []) as Array<Record<string, unknown>>
      ).map((c) => ({ ...c, id: bytes(c.id as string) })),
    } as unknown as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;
  if (!key) throw new Error('PASSKEY_CANCELLED');
  const response = key.response as AuthenticatorAssertionResponse;
  return {
    id: key.id,
    rawId: encoded(key.rawId),
    type: key.type,
    clientExtensionResults: key.getClientExtensionResults(),
    response: {
      clientDataJSON: encoded(response.clientDataJSON),
      authenticatorData: encoded(response.authenticatorData),
      signature: encoded(response.signature),
      userHandle: response.userHandle ? encoded(response.userHandle) : null,
    },
  };
}
