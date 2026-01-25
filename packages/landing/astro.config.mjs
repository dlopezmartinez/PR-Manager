import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://prmanager.app',
  integrations: [tailwind()],
  output: 'hybrid',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    port: 3000,
  },
});
