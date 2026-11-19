import { socialId, SkySocialError } from './sky-social.ts';
import { shareDigest, shareVersion } from './sky-agent-share.ts';

export type AgentOutcome = { id:string; version:number; digest:string; helpful:boolean; modified:boolean };
export type AgentOutcomeSummary = { original:{helpful:number;notHelpful:number}; modified:{helpful:number;notHelpful:number} };
export type AgentOutcomeDraft = { postId:string; expected:string|null; digest:string; content:string; communityId:string|null; attachment:{kind:'agent-outcome';resource:string} };
export function outcomeResource(v:AgentOutcome) { return `${socialId(v.id)}:${shareVersion(v.version)}:${shareDigest(v.digest)}:${v.helpful?'h':'n'}:${v.modified?'m':'o'}`; }
export function parseOutcomeResource(resource:string):AgentOutcome {
  const [id,version,digest,helpful,modified,...rest]=resource.split(':');
  if(rest.length||!['h','n'].includes(helpful)||!['m','o'].includes(modified)||!/^[1-9][0-9]{0,2}$/.test(version??''))throw new SkySocialError('利用結果の形式を確認してください。');
  return {id:socialId(id),version:shareVersion(Number(version)),digest:shareDigest(digest),helpful:helpful==='h',modified:modified==='m'};
}
