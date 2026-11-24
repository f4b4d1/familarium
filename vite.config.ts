import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Nur auf diesem Rechner erreichbar (Q11): kein Zugriff aus dem Netzwerk.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
