import { defineConfig } from 'vite';

// The city app lives in city/. The assets folder is served as static files,
// so manifest paths such as "buildings/x/x.obj" resolve from the site root.
export default defineConfig({
  root: 'city',
  publicDir: '../assets',
  build: { outDir: '../dist', emptyOutDir: true },
});
