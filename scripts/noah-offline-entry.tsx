import { createRoot } from 'react-dom/client';
import { NoahLocaleProvider } from '@/components/noah-locale';
import { NoahTigerOffline } from '@/components/noah-tiger-game';

createRoot(document.getElementById('noah-offline')!).render(
  <NoahLocaleProvider><NoahTigerOffline /></NoahLocaleProvider>,
);
