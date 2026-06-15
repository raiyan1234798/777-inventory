import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import os from 'os';

export default defineConfig({
  plugins: [react()],
  // Use system temp dir to avoid node_modules write restriction (Cloudflare / sandbox)
  cacheDir: resolve(os.tmpdir(), 'vite-777-cache'),
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('tesseract.js')) {
              return 'vendor-tesseract';
            }
            return 'vendor';
          }
        },
      },
    },
    minify: 'esbuild',
    target: 'esnext',
    sourcemap: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/firestore'],
  },
});
