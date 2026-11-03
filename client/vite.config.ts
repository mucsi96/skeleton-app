import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative module/CSS URLs continue to work on the public Blob asset origin.
  base: './',
  plugins: [react()],
  build: { rollupOptions: { output: { chunkFileNames: 'assets/chunk-[name]-[hash].js' } } },
  server: { proxy: { '/api': 'http://localhost:8053', '/oauth2': 'http://localhost:8150' } },
});
