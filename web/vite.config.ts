import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import zh from './lib/i18n/zh-CN.json';

const loadingTemplate = new URL(
  './components/workspace/loading.html',
  import.meta.url,
);
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
  plugins: [
    react(),
    {
      name: 'studio-loading-page',
      transformIndexHtml: (html) =>
        html.replace(
          '<!-- studio-loading -->',
          readFileSync(loadingTemplate, 'utf8').replace(
            '__STUDIO_LOADING_LABEL__',
            zh.app.loading,
          ),
        ),
    },
  ],
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
