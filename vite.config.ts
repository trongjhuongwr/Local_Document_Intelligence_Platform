import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // The FastAPI backend (app.api.main:app). Repo .env sets API_PORT=8001.
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8001';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      proxy: {
        // All frontend fetches stay relative ("/api/..."), so the same code
        // works behind this dev proxy and behind any reverse proxy in prod.
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
