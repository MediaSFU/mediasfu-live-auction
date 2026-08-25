import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'mediasfu-reactjs': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../Projecte/MediaSFUReactJS/src/main.tsx') } },
  server: { port: 4176, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8791', '/health': 'http://127.0.0.1:8791' } },
});
