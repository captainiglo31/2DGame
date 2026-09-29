import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` inlines everything (incl. the wasm) into one HTML file for easy sharing.
export default defineConfig(({ mode }) => ({
  root: 'web',
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? '../dist-single' : '../dist',
    emptyOutDir: true,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: {
    root: '.',
    include: ['web/src/**/*.test.ts'],
    environment: 'node',
  },
}));
