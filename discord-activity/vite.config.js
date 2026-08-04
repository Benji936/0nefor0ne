import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Vite only builds the client here — `wrangler dev` serves the output together
// with the Worker and the Durable Object, so local dev matches production
// exactly (same origin for /api/* and /ws, no proxying).
export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true },
});
