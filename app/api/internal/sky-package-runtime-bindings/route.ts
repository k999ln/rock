import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRateCardOperator } from '@/lib/remote-ai-rate-card-operator';
import {
  trustedSkyPackageRuntimeBindingKeyResolver,
  verifySkyPackageRuntimeBinding,
  type SkyPackageRuntimeBinding,
} from '@/lib/sky-package-runtime-binding';
import {
  SkyPackageRuntimeBindingStore,
  SkyPackageRuntimeBindingStoreError,
} from '@/lib/sky-package-runtime-binding-store';
import { skyPackageSchemaSha256 } from '@/lib/sky-package-runtime';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_768) throw new Error('BODY_TOO_LARGE');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY_SHAPE');
  return value as Record<string, unknown>;
}

async function authorize(request: Request) {
  const runtime = env as unknown as {
    SKY_PACKAGE_BINDING_OPERATOR_TOKEN?: string;
    SKY_PACKAGE_BINDING_OPERATOR_ID?: string;
  };
  return authorizeRemoteAiRateCardOperator(
    request,
    runtime.SKY_PACKAGE_BINDING_OPERATOR_TOKEN,
    runtime.SKY_PACKAGE_BINDING_OPERATOR_ID,
  );
}

function handleError(error: unknown) {
  if (error instanceof SkyPackageRuntimeBindingStoreError) {
    const status = error.code === 'BINDING_NOT_FOUND' ? 404
      : error.code === 'BINDING_STORE_UNAVAILABLE' ? 503 : 409;
    return json({ code: error.code }, status);
  }
  if (error instanceof SyntaxError) return json({ code: 'INVALID_INPUT' }, 400);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return json({ code: 'BODY_TOO_LARGE' }, 413);
  if (error instanceof Error && error.message === 'INVALID_BODY_SHAPE') return json({ code: 'INVALID_BODY_SHAPE' }, 400);
  console.error('Sky Package runtime binding registry failed', error instanceof Error ? error.message : 'unknown');
  return json({ code: 'BINDING_STORE_UNAVAILABLE' }, 503);
}

export async function POST(request: Request) {
  const access = await authorize(request);
  if (!access.ok) return json({ code: access.code }, access.status);
  try {
    const input = await readBody(request);
    if (Object.keys(input).length !== 1 || !('binding' in input)) return json({ code: 'INVALID_INPUT' }, 400);
    const binding = input.binding as SkyPackageRuntimeBinding;
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return json({ code: 'INVALID_BINDING' }, 400);
    const intent = {
      agentOrigin: binding.agentOrigin,
      agentName: binding.agentName,
      agentVersion: binding.agentVersion,
      agentCardSha256: binding.agentCardSha256,
      packageKey: binding.packageKey,
      manifestSha256: binding.manifestSha256,
      runtimeExtensionUri: binding.runtimeExtensionUri,
      inputSchemaSha256: binding.inputSchemaSha256,
      outputSchemaSha256: binding.outputSchemaSha256,
    };
    const runtime = env as unknown as { SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS?: string; SKY_PACKAGE_RUNTIME_EXTENSION_URI?: string };
    if (!runtime.SKY_PACKAGE_RUNTIME_EXTENSION_URI || binding.runtimeExtensionUri !== runtime.SKY_PACKAGE_RUNTIME_EXTENSION_URI)
      return json({ code: 'PACKAGE_RUNTIME_EXTENSION_NOT_CONFIGURED' }, 503);
    const resolver = trustedSkyPackageRuntimeBindingKeyResolver(runtime.SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS);
    const verified = await verifySkyPackageRuntimeBinding(binding, intent, resolver);
    if (!verified) return json({ code: 'INVALID_BINDING_SIGNATURE_OR_TERMS' }, 400);

    const db = database();
    const reviewed = await skyToolPackageStore(db).verifiedRegistryPackage(binding.packageKey, binding.manifestSha256);
    if (!reviewed) return json({ code: 'PACKAGE_NOT_CURRENTLY_REVIEWED' }, 409);
    const [inputSchemaSha256, outputSchemaSha256] = await Promise.all([
      skyPackageSchemaSha256(reviewed.manifest.io.inputSchema),
      skyPackageSchemaSha256(reviewed.manifest.io.outputSchema),
    ]);
    if (binding.inputSchemaSha256 !== inputSchemaSha256 || binding.outputSchemaSha256 !== outputSchemaSha256)
      return json({ code: 'PACKAGE_SCHEMA_MISMATCH' }, 409);

    const result = await new SkyPackageRuntimeBindingStore(db).register(verified, access.operatorId);
    return json({ bindingId: verified.bindingId, ...result }, result.inserted ? 201 : 200);
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request) {
  const access = await authorize(request);
  if (!access.ok) return json({ code: access.code }, access.status);
  try {
    const input = await readBody(request);
    if (Object.keys(input).length !== 2 || input.action !== 'revoke' ||
      typeof input.bindingId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.bindingId))
      return json({ code: 'INVALID_REVOCATION_REQUEST' }, 400);
    const result = await new SkyPackageRuntimeBindingStore(database()).revoke(input.bindingId, access.operatorId);
    return json({ bindingId: input.bindingId, ...result });
  } catch (error) { return handleError(error); }
}
