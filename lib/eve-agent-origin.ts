import { parseEveSourcePin, type EveSourcePin } from './eve-source-context.ts';
/** Owner-confirmed history. The server does not attest the model or reply content. */
export type EveAgentOrigin = { schema:'rockstaros.eve-agent-origin/1'; threadId:string; replyId:string; replySha256:string; source?:EveSourcePin };
export function parseEveAgentOrigin(value: unknown): EveAgentOrigin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('下書きの由来を確認してください。');
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(k=>!['schema','threadId','replyId','replySha256','source'].includes(k)) || v.schema!=='rockstaros.eve-agent-origin/1' ||
      typeof v.threadId!=='string' || !/^[a-zA-Z0-9:._-]{1,100}$/.test(v.threadId) || typeof v.replyId!=='string' || !/^[a-zA-Z0-9:._-]{1,100}$/.test(v.replyId) ||
      typeof v.replySha256!=='string' || !/^[a-f0-9]{64}$/.test(v.replySha256)) throw new Error('下書きの由来を確認してください。');
  return {schema:v.schema,threadId:v.threadId,replyId:v.replyId,replySha256:v.replySha256,...(Object.hasOwn(v,'source')?{source:parseEveSourcePin(v.source)}:{})};
}
export async function makeEveAgentOrigin(threadId:string,replyId:string,text:string,source?:EveSourcePin):Promise<EveAgentOrigin> {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return parseEveAgentOrigin({schema:'rockstaros.eve-agent-origin/1',threadId,replyId,replySha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),...(source?{source}:{})});
}
