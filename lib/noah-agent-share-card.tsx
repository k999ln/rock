import type { NoahShareAgent } from './noah-agent-share';

export function NoahAgentShareCard({ agent }: { agent: NoahShareAgent }) {
  return <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#fff', padding: '58px 64px', color: '#17212b', fontFamily: 'Noah JP', border: '2px solid #dce2e8' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 42 }}>Noah</div>
      <div style={{ fontSize: 22, color: '#52606d' }}>Agent</div>
    </div>
    <div style={{ display: 'flex', fontSize: agent.name.length > 35 ? 46 : 64, lineHeight: 1.2, marginTop: 54, maxHeight: 156, overflow: 'hidden', wordBreak: 'break-word' }}>{agent.name}</div>
    <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.55, marginTop: 25, maxHeight: 134, overflow: 'hidden', color: '#465463', wordBreak: 'break-word' }}>{Array.from(agent.summary || 'Noahで詳細を確認できます。').slice(0, 160).join('')}</div>
    <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 22, borderTop: '1px solid #dce2e8', justifyContent: 'space-between', fontSize: 21, color: '#52606d' }}>
      <div style={{ maxWidth: 720, overflow: 'hidden' }}>{agent.provider}</div>
      <div>avoado.si/noah</div>
    </div>
  </div>;
}
