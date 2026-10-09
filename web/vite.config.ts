import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Les pages de sonde et de calibration sont publiées avec le site : les e2e tournent sur la version déployée
// (décision du 09/10/2026). Elles ne sont liées depuis aucune page du jeu.
export default defineConfig({
  plugins: [react()],
  build: { rolldownOptions: { input: { main: 'index.html', probe: 'probe.html', calibrate: 'calibrate.html' } } },
});
