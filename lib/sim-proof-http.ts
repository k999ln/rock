import { readBoundedStream } from './bounded-stream.ts';
import { requestUser } from './request-auth.ts';
import { simProofStore } from './sim-proof-store.ts';
import { MAX_SIM_PROOF_TOKEN_LENGTH, verifySimProof } from './sim-proof.ts';

const MAX_PROOF_AGE_MS = 600_000;
const MAX_BODY_BYTES = MAX_SIM_PROOF_TOKEN_LENGTH + 128;

export type SimProofEnvironment = {
  DB?: D1Database;
  SIM_PROOF_PUBLIC_KEYS_JSON?: string;
  SIM_PROOF_HASH_SECRET?: string;
  ESIMGO_PROFILE_HASH_SECRET?: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

async function readField(request: Request, field: string): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const bytes = await readBoundedStream(reader, MAX_BODY_BYTES, () => new Error('SIM_PROOF_BODY_TOO_LARGE'));
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return null;
    const value: unknown = (body as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function proofConfig(env: SimProofEnvironment) {
  const hashSecret = env.SIM_PROOF_HASH_SECRET;
  if (!hashSecret || hashSecret.length < 32 || hashSecret === env.ESIMGO_PROFILE_HASH_SECRET ||
      !env.SIM_PROOF_PUBLIC_KEYS_JSON) throw new Error('SIM_PROOF_UNAVAILABLE');

  const keys: unknown = JSON.parse(env.SIM_PROOF_PUBLIC_KEYS_JSON);
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('SIM_PROOF_UNAVAILABLE');
  const publicKeys = new Map<string, string>();
  for (const [kid, value] of Object.entries(keys)) {
    if (!kid || typeof value !== 'string' || !value.trim()) throw new Error('SIM_PROOF_UNAVAILABLE');
    publicKeys.set(kid, value.trim());
  }
  if (!publicKeys.size) throw new Error('SIM_PROOF_UNAVAILABLE');
  return { publicKeys, hashSecret, maxAgeMs: MAX_PROOF_AGE_MS };
}

export async function handleSimProof(
  request: Request,
  action: 'bind' | 'revoke' | 'verify',
  env: SimProofEnvironment,
) {
  const usePasskey = { verification: 'passkey_required' };
  try {
    const owner = await requestUser(request, {
      allowEsimCloudIdentity: false,
      allowDeviceSession: action === 'verify',
    });
    if (!env.DB) throw new Error('SIM_PROOF_UNAVAILABLE');
    const store = simProofStore(env.DB);

    if (action === 'revoke') {
      const id = await readField(request, 'bindingId');
      if (!id || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
        return json({ error: 'invalid_request' }, 400);
      }
      const binding = await store.revoke(owner, id, Date.now());
      return binding ? json({ binding }) : json({ error: 'binding_not_found' }, 404);
    }

    const token = await readField(request, 'token');
    if (!token) return action === 'verify' ? json(usePasskey) : json({ error: 'invalid_request' }, 400);
    const now = Date.now();
    const proof = await verifySimProof(token, { ...proofConfig(env), now });
    if (action === 'verify') {
      const matches = proof && await store.matches(owner, proof);
      return json(matches ? { verification: 'sim_verified' } : usePasskey);
    }
    if (!proof) return json({ error: 'invalid_sim_proof' }, 401);
    const binding = await store.bind(owner, proof, now);
    return binding ? json({ binding }) : json({ error: 'sim_binding_conflict' }, 409);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    if (code === 'UNAUTHORIZED') {
      return json(action === 'verify' ? usePasskey : { error: 'sign_in_required' }, 401);
    }
    if (code === 'SIM_PROOF_BODY_TOO_LARGE') return json({ error: 'request_too_large' }, 413);
    return json(action === 'verify' ? usePasskey : { error: 'sim_proof_unavailable' }, 503);
  }
}
