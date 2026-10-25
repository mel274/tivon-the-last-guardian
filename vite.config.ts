import { defineConfig } from 'vite';

// GitHub Pages serves the game from /<repo-name>/; the deploy workflow sets BASE_PATH. Local dev stays at /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
