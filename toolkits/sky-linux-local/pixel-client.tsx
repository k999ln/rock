import { createRoot } from 'react-dom/client';
import SkyLinuxLocalLab from '../../components/sky-linux-local-lab';

createRoot(document.getElementById('root')!).render(<SkyLinuxLocalLab pixelLocal eve={window.location.pathname === '/eve'} />);
