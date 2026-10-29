import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MiiWorkPreview from '../../../components/mii-work-preview';
import type { WorkJob } from '../../../lib/workflow';
const fixture = (window as unknown as Window & { fixture: { job: WorkJob; ownerScope: string } }).fixture;
function App() {
  const [job, setJob] = useState(fixture.job);
  return <MiiWorkPreview job={job} ownerScope={fixture.ownerScope} onRead={setJob} />;
}
createRoot(document.getElementById('root')!).render(<App />);
