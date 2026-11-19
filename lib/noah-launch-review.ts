import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { parseSkyToolReview, skyToolReviewStore } from './sky-tool-review.ts';
import { ownerScopeFor } from './owner-intent.ts';
import { noahArtifactKey, verifiedArtifactBytes } from './noah-artifact.ts';
import {
  parseSkyToolPackage,
  skyToolPackageSha256,
} from './sky-tool-package.ts';
import { SkySubmissionError } from './sky-submission.ts';
export function createNoahReviewApi(deps: {
  db: Pick<D1Database, 'prepare' | 'batch'>;
  authenticate: (r: Request) => Promise<string>;
  reviewers: string[];
  bucket?: Pick<R2Bucket, 'get'>;
}) {
  return async (r: Request) => {
    try {
      const user = await deps.authenticate(r);
      if (!deps.reviewers.includes(user))
        throw new NoahAgentError(
          '審査担当者としてサインインしてください。',
          403,
        );
      const q = new URL(r.url).searchParams;
      if (r.method === 'GET' && q.has('source')) {
        const key = q.get('source'),
          digest = q.get('manifest');
        const load = () =>
          deps.db
            .prepare(
              "SELECT user_id AS owner,manifest,manifest_sha256 AS digest FROM sky_tool_packages WHERE package_key=? AND manifest_sha256=? AND user_id<>? AND status IN ('published_declared','verified')",
            )
            .bind(key, digest, user)
            .first<{ owner: string; manifest: string; digest: string }>();
        const row = await load();
        if (!row) throw new NoahAgentError('審査対象が見つかりません。', 404);
        const manifest = parseSkyToolPackage(JSON.parse(row.manifest)),
          artifact = manifest.source.artifact;
        if (!artifact || (await skyToolPackageSha256(manifest)) !== row.digest)
          throw new NoahAgentError(
            '固定された配布コードを確認できません。',
            409,
          );
        const object = await deps.bucket?.get(
          await noahArtifactKey(row.owner, artifact.sha256),
        );
        if (!object)
          throw new NoahAgentError('配布コードを取得できません。', 503);
        const bytes = await verifiedArtifactBytes(object, artifact);
        if (!(await load()))
          throw new NoahAgentError('審査対象が変更されました。', 409);
        return new Response(bytes, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store, private',
            'Content-Disposition': `attachment; filename="agent-source"; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'X-Content-SHA256': artifact.sha256,
          },
        });
      }
      if (r.method === 'GET') {
        const rows = await deps.db
          .prepare(
            "SELECT package_key AS packageKey,manifest,manifest_sha256 AS manifestSha256,status FROM sky_tool_packages WHERE status IN ('published_declared','verified') AND user_id<>? ORDER BY updated_at DESC LIMIT 100",
          )
          .bind(user)
          .all<{ manifest: string }>();
        return Response.json(
          {
            packages: rows.results.map((p) => ({
              ...p,
              manifest: JSON.parse(p.manifest),
            })),
            ownerScope: await ownerScopeFor(user),
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (r.method !== 'POST')
        throw new NoahAgentError('対応しない操作です。', 405);
      if (
        r.headers.get('origin') !== new URL(r.url).origin ||
        r.headers.get('x-rock-owner-scope') !== (await ownerScopeFor(user))
      )
        throw new NoahAgentError(
          '本人と同じNoah画面から操作してください。',
          403,
        );
      const input = parseSkyToolReview(
        JSON.parse(new TextDecoder().decode(await boundedNoahBody(r, 32768))),
      );
      const p = await deps.db
        .prepare(
          'SELECT user_id AS owner,status FROM sky_tool_packages WHERE package_key=? AND manifest_sha256=?',
        )
        .bind(input.packageKey, input.manifestSha256)
        .first<{ owner: string; status: string }>();
      if (!p) throw new NoahAgentError('対象の版が見つかりません。', 404);
      if (p.owner === user)
        throw new NoahAgentError('作者自身による審査はできません。', 403);
      if (input.decision !== 'revoked' && p.status !== 'published_declared')
        throw new NoahAgentError('作者が提出した版を審査してください。', 409);
      return Response.json(
        await skyToolReviewStore(deps.db).review(user, input),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      const status =
        e instanceof NoahAgentError || e instanceof SkySubmissionError
          ? e.status
          : e instanceof Error && e.message === 'UNAUTHORIZED'
            ? 401
            : e instanceof SyntaxError
              ? 400
              : 503;
      return Response.json(
        {
          error:
            e instanceof NoahAgentError || e instanceof SkySubmissionError
              ? e.message
              : '審査の本人確認または保存を完了できません。',
        },
        { status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}
