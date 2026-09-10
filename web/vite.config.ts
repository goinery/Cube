import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      cubejs: fileURLToPath(
        new URL('./lib/vendor/cubejs/index.cjs', import.meta.url),
      ),
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  // Local CommonJS is not converted by Vite's normal source transforms.
  // Include both solvers so module Workers receive browser-loadable ESM in dev.
  optimizeDeps: {
    include: ['cubejs', 'rubiks-cube-solver/lib/index.common.js'],
  },
  server: { host: '0.0.0.0', port: 3000, strictPort: true },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three/ }],
        },
      },
    },
  },
});
