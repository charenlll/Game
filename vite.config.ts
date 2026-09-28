import { defineConfig } from 'vite';
import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const retiredFerryButton = resolve('public/assets/ui/hub/buttons/ferry_primary_button.png');

export default defineConfig({
  // GitHub Pages project sites are served below /<repository>/.
  base: '/Game/',
  build: {
    outDir: 'build',
    // The replaced button file can be held open by an image editor on Windows.
    // Copy public assets ourselves so that obsolete file does not block builds.
    copyPublicDir: false,
    // Keep the directory on Windows to avoid intermittent EPERM failures.
    // The generated index.html only references files from the current build.
    emptyOutDir: false,
  },
  plugins: [{
    name: 'copy-active-public-assets',
    apply: 'build',
    async closeBundle() {
      await cp(resolve('public'), resolve('build'), {
        recursive: true,
        force: true,
        filter: source => resolve(source) !== retiredFerryButton,
      });
      await rm(resolve('build/assets/ui/hub/buttons/ferry_primary_button.png'), { force: true });
    },
  }],
});
