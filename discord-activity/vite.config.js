import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The activity runs inside a Discord iframe in production, but during local UI
// work we run Vite directly. The proxy lets the dev client reach the Express
// server (token exchange + WebSocket relay) without CORS gymnastics.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
    // When tunnelling through cloudflared/ngrok for a real in-Discord test,
    // HMR must report the public HTTPS port so the websocket can reconnect.
    // hmr: { clientPort: 443 },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
