import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initInstall } from './pwa/install';
import './ui/theme.css';

// au plus tôt : le navigateur peut proposer l'installation avant le premier rendu
initInstall(() => window.dispatchEvent(new Event('countrizz:installee')));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
