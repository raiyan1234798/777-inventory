import { build } from '/Users/rayan/Downloads/777 Inventory/node_modules/vite/dist/node/index.js';
import react from '/Users/rayan/Downloads/777 Inventory/node_modules/@vitejs/plugin-react/dist/index.js';
import { resolve } from 'path';
import os from 'os';

const root = process.cwd();

try {
  await build({
    configFile: false,
    plugins: [react()],
    root,
    cacheDir: resolve(os.tmpdir(), 'vite-777-cache'),
    build: {
      outDir: resolve(root, 'dist'),
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('xlsx')) return 'vendor-xlsx';
              if (id.includes('tesseract')) return 'vendor-tesseract';
              return 'vendor';
            }
          }
        }
      },
      minify: 'esbuild',
      target: 'esnext',
      sourcemap: false,
    }
  });
  console.log('BUILD SUCCESS');
} catch(e) {
  console.error('BUILD FAILED:', e.message);
  process.exit(1);
}
