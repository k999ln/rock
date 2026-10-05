import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { a2aDelegationStore } from '@/lib/a2a-delegation-store';
import { decryptA2AArtifact } from '@/lib/a2a-input-crypto';

type Context = { params: Promise<{ id: string }> };
const inputKey = (env as unknown as { A2A_INPUT_ENCRYPTION_KEY?: string })
  .A2A_INPUT_ENCRYPTION_KEY;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request, context: Context) {
  try {
    const owner = await requestRockstarUser(request, database());
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: '委任IDが不正です。' }, 400);
    const store = a2aDelegationStore(database());
    const delegation = await store.get(owner, id);
    if (!delegation) return json({ error: '委任が見つかりません。' }, 404);
    const encrypted = await store.listArtifacts(owner, id);
    if (encrypted.length && !inputKey)
      return json({ error: '成果を復号する鍵が設定されていません。' }, 503);
    const artifacts = await Promise.all(
      encrypted.map(async (artifact) => {
        const serialized = await decryptA2AArtifact(
          {
            ciphertext: artifact.ciphertext,
            nonce: artifact.nonce,
            artifactSha256: artifact.artifactSha256,
            keyVersion: artifact.keyVersion as 'aes-256-gcm-v1',
          },
          inputKey!,
          owner,
          id,
          artifact.remoteTaskId,
        );
        const document: unknown = JSON.parse(serialized);
        return {
          id: artifact.id,
          remoteTaskId: artifact.remoteTaskId,
          sha256: artifact.artifactSha256,
          byteLength: artifact.byteLength,
          createdAt: artifact.createdAt,
          document,
        };
      }),
    );
    return json({
      delegationId: id,
      captured: delegation.artifactsCaptured === 1,
      artifacts,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインが必要です。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このサイトから操作してください。' }, 403);
    return json({ error: '成果を取得できませんでした。' }, 503);
  }
}
