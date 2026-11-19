import { parseSkyAgentSettings, type SkyAgentSettings } from './sky-agent-library.ts';
import { socialId, socialObject, socialText, SkySocialError } from './sky-social.ts';

export type AgentShareLicense = 'CC-BY-4.0' | 'community-copy/1';
export type AgentShareRef = { id: string; version: number; digest: string; author: string; license: AgentShareLicense };
export type AgentShareManifest = {
  schema: 'rockstar-agent-share/1';
  id: string;
  version: number;
  author: string;
  communityId: string | null;
  license: AgentShareLicense;
  description: string;
  agent: Pick<SkyAgentSettings, 'name' | 'instructions' | 'provider' | 'model'>;
  parent: AgentShareRef | null;
};
export function shareVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100)
    throw new SkySocialError('共有版を確認してください。');
  return value as number;
}
export function shareDigest(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new SkySocialError('共有内容のhashを確認してください。');
  return value;
}
export function parseAgentShare(value: unknown): AgentShareManifest {
  const v = socialObject(value, ['schema','id','version','author','communityId','license','description','agent','parent']);
  if (v.schema !== 'rockstar-agent-share/1' || !['CC-BY-4.0','community-copy/1'].includes(String(v.license)) || (v.communityId === null && v.license !== 'CC-BY-4.0')) throw new SkySocialError('対応する共有形式と利用条件を確認してください。');
  const a = socialObject(v.agent, ['name','instructions','provider','model']);
  const settings = parseSkyAgentSettings({ ...a, enabled: false });
  let parent: AgentShareRef | null = null;
  if (v.parent !== null) {
    const p = socialObject(v.parent, ['id','version','digest','author','license']);
    if (!['CC-BY-4.0','community-copy/1'].includes(String(p.license))) throw new SkySocialError('元の利用条件を確認してください。');
    parent = { id: socialId(p.id), version: shareVersion(p.version), digest: shareDigest(p.digest), author: socialId(p.author), license: p.license as AgentShareLicense };
  }
  return { schema: 'rockstar-agent-share/1', id: socialId(v.id), version: shareVersion(v.version), author: socialId(v.author),
    communityId: v.communityId === null ? null : socialId(v.communityId), license: v.license as AgentShareLicense,
    description: socialText(v.description, 300),
    agent: { name: settings.name, instructions: settings.instructions, provider: settings.provider, model: settings.model }, parent };
}
export function agentShareResource(id: string, version: number) { return `${socialId(id)}:${shareVersion(version)}`; }
export function parseAgentShareResource(resource: string) {
  const parts = resource.split(':');
  if (parts.length !== 2 || !/^[1-9][0-9]{0,2}$/.test(parts[1])) throw new SkySocialError('共有担当の版を確認してください。');
  return { id: socialId(parts[0]), version: shareVersion(Number(parts[1])) };
}
