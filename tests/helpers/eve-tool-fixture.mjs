import { eveAgentFixture } from './eve-agent-fixture.mjs';
import { eveHistoryStore } from '../../lib/eve-history.ts';
export function runtimeFixture(t) {const f=eveAgentFixture(t);return {...f,sql:f.sqlite,history:(owner='alice')=>eveHistoryStore(f.db,owner,f.keys,true)};}
