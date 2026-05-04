import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Cloudflare Pages has 25 MB limit per asset; split aggressively
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
    // Faster builds with esbuild minification
    minify: 'esbuild',
    target: 'esnext',
    // Enable source maps only in dev
    sourcemap: false,
  },
  // Faster dev server start
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/firestore'],
  },
})
