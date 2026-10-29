import type { SkyToolPackage } from './sky-tool-package.ts';
import type { McpConnection } from './mcp-hub.ts';
import { compatibleLocalPackageRuntimes } from './sky-package-runtime.ts';

/** A user's requested connection, not an execution grant or a claim of capability. */
export type SkyAgentRequirements = {
  inputFields: string[];
  outputFields: string[];
  packageKey: string;
  executionTarget: '' | 'device_local' | 'pc' | 'cloud';
};

const hasControl = (value: string) => {
  for (let i = 0; i < value.length; i++) { const n = value.charCodeAt(i); if (n < 32 || n === 127) return true; }
  return false;
};

export function parseSkyAgentRequirements(value: unknown): SkyAgentRequirements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('必要な入力と成果の形式を確認してください。');
  const row = value as Record<string, unknown>;
  const keys = ['inputFields', 'outputFields', 'packageKey', 'executionTarget'];
  if (Object.keys(row).length !== keys.length || keys.some(k => !Object.hasOwn(row, k)))
    throw new Error('必要な入力と成果の項目を確認してください。');
  const fields = (input: unknown) => {
    if (!Array.isArray(input) || input.length > 16 || input.some(v => typeof v !== 'string' || !v.trim() || v.length > 80 || hasControl(v)))
      throw new Error('入力と成果の項目を確認してください。');
    const result = (input as string[]).map(v => v.trim());
    if (new Set(result).size !== result.length) throw new Error('入力と成果の項目が重複しています。');
    return result;
  };
  if (typeof row.packageKey !== 'string' || row.packageKey.length > 200 || hasControl(row.packageKey) ||
      typeof row.executionTarget !== 'string' || !['', 'device_local', 'pc', 'cloud'].includes(row.executionTarget))
    throw new Error('Toolと実行先を確認してください。');
  return { inputFields: fields(row.inputFields), outputFields: fields(row.outputFields), packageKey: row.packageKey,
    executionTarget: row.executionTarget as SkyAgentRequirements['executionTarget'] };
}

export type RequirementsPackage = { packageKey: string; manifest: SkyToolPackage; status: string; installable: boolean };
export type RequirementsReview = {
  state: 'needs_selection' | 'unavailable' | 'missing' | 'unconfirmed' | 'candidate';
  issues: string[];
  candidates: Array<{ serverId: string; serverName: string; toolName: string }>;
};

/** Review declarations only; dispatch must repeat the existing server-side authority checks. */
export function reviewSkyAgentRequirements(requirements: SkyAgentRequirements, packages: readonly RequirementsPackage[],
  servers: readonly McpConnection[] | null): RequirementsReview {
  const r = parseSkyAgentRequirements(requirements);
  if (!r.packageKey || !r.executionTarget) return { state: 'needs_selection', issues: ['Toolと実行先を選んでください。'], candidates: [] };
  const pkg = packages.find(item => item.packageKey === r.packageKey);
  if (!pkg) return { state: 'unavailable', issues: ['選択したToolを本人の一覧で確認できません。'], candidates: [] };
  if (pkg.status !== 'verified' || pkg.installable !== true)
    return { state: 'unavailable', issues: ['Toolの審査状態を確認してください。'], candidates: [] };
  if (!pkg.manifest.capabilities.executionTargets.includes(r.executionTarget))
    return { state: 'missing', issues: ['選んだ実行先はToolの宣言にありません。'], candidates: [] };
  const issues: string[] = [];
  const unconfirmed: string[] = [];
  const fields = (schema: Record<string, unknown>, desired: string[], label: string) => {
    const props = schema.properties;
    if (schema.type !== 'object' || !props || typeof props !== 'object' || Array.isArray(props)) {
      unconfirmed.push(`${label}の宣言を確認できません。`);
      return;
    }
    for (const key of desired) if (!Object.hasOwn(props, key)) issues.push(`${label}「${key}」は宣言で確認できません。`);
  };
  fields(pkg.manifest.io.inputSchema, r.inputFields, '入力');
  fields(pkg.manifest.io.outputSchema, r.outputFields, '成果');
  const requiredInput = pkg.manifest.io.inputSchema.required;
  if (Array.isArray(requiredInput)) {
    for (const key of requiredInput) {
      if (typeof key === 'string' && !r.inputFields.includes(key))
        issues.push(`Toolの必須入力「${key}」が担当の必要な入力にありません。`);
    }
  }
  if (issues.length) return { state: 'missing', issues, candidates: [] };
  if (unconfirmed.length) return { state: 'unconfirmed', issues: unconfirmed, candidates: [] };
  if (r.executionTarget !== 'pc') return { state: 'unconfirmed', issues: ['この実行先の接続・権限・費用は実行時に確認してください。'], candidates: [] };
  if (!servers) return { state: 'unconfirmed', issues: ['PCの接続状態を確認できません。'], candidates: [] };
  const candidates = compatibleLocalPackageRuntimes(pkg.manifest, servers).map(({ server, tool }) => ({
    serverId: server.id, serverName: server.name, toolName: tool.name,
  }));
  return candidates.length
    ? { state: 'candidate', issues: ['項目名と接続候補を確認しました。型・値と成果の適合、本人承認は別に確認してください。'], candidates }
    : { state: 'unavailable', issues: ['一致する接続済みPC Toolを確認できません。'], candidates: [] };
}
