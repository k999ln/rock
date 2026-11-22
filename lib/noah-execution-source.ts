import { canonicalOperationValue } from './noah-operation-contract.mjs';
import { resolveNoahInviteExecution } from './noah-invite-execution.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { authorizedNoahRelease, type NoahReleaseDependencies } from './noah-release.ts';
import { NoahExecutionError, type NoahExecution } from './noah-execution.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
export async function validateNoahExecutionSource(deps: NoahReleaseDependencies, owner: string, execution: NoahExecution) {
  const source = execution.source;
  if (source) {
    const upload = await noahAgentStore(deps.db, owner).get(source.uploadId);
    if (!upload || upload.uploadState !== 'ready' || upload.manifestSha256 !== source.manifestSha256 ||
      upload.source?.sha256 !== source.sourceSha256 || upload.manifest.version !== execution.version ||
      JSON.stringify(upload.manifest.runtime) !== JSON.stringify(source.runtime)) throw new NoahExecutionError('登録した版・所有者・コードを確認できません。', 409);
  }
  if (execution.invite) {
    try {
      const a = await resolveNoahInviteExecution(deps.db, owner, execution.invite.inviteId);
      if (a.id !== execution.agentId || a.manifest.version !== execution.version || canonicalOperationValue(a.invite) !== canonicalOperationValue(execution.invite)) throw new NoahExecutionError('招待の固定版・許可が変わりました。', 409);
    } catch (e) { if (e instanceof NoahAgentError) throw new NoahExecutionError(e.message, e.status); throw e; }
  }
  const release = execution.release;
  if (release) {
    try {
      const { manifest, artifact } = await authorizedNoahRelease(deps, owner, release.packageKey, release.manifestSha256, true);
      if (artifact.sha256 !== release.sourceSha256 || manifest.version !== execution.version ||
        manifest.execution.timeoutSeconds !== release.timeoutSeconds || JSON.stringify(artifact.runtime) !== JSON.stringify(release.runtime)) throw new NoahExecutionError('購入した配布版・実行定義・コードを確認できません。', 409);
    } catch (e) { if (e instanceof NoahAgentError) throw new NoahExecutionError(e.message, e.status); throw e; }
  }
}
