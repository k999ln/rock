import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import EveObjectAgentCreator from '../../../components/eve-object-agent-creator';
import Workbench from '../../../components/workbench';
import SkyAgentLibrary from '../../../components/sky-agent-library';
import type { McpConnection } from '../../../lib/mcp-hub';

function App() {
  const [url, setUrl] = useState(location.href);
  useEffect(() => { const changed = () => setUrl(location.href); addEventListener('fixture-navigation', changed); return () => removeEventListener('fixture-navigation', changed); }, []);
  const params = new URL(url).searchParams;
  const id = params.get('agent'), revision = Number(params.get('agentRevision'));
  return <main>{location.pathname === '/sky/agents' ? <SkyAgentLibrary /> : !id ? <EveObjectAgentCreator /> : <Workbench embedded initialPackageKey={params.get('package') ?? ''}
    packageRuntimeServers={(window as Window & { __fixtureServers?: McpConnection[] }).__fixtureServers ?? []} agentReference={{ id, revision }} agentRequired />}</main>;
}
createRoot(document.getElementById('root')!).render(<App />);
