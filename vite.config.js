import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repo name
// (e.g. https://<user>.github.io/<repo>/) as well as a custom domain or local preview.
export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
