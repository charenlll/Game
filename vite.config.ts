import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project sites are served below /<repository>/.
  base: '/Game/',
  build: {
    outDir: 'build',
    // Keep the directory on Windows to avoid intermittent EPERM failures.
    // The generated index.html only references files from the current build.
    emptyOutDir: false,
  },
});
