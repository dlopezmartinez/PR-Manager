import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://prmanager.app',
  integrations: [tailwind()],
  output: 'static',
  server: {
    port: 3000,
  },
});
