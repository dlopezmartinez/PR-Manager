/// <reference types="vite/client" />
declare module '*.css';

import './styles/theme.css';
import './index.css';
import { createApp } from 'vue';
import App from './App.vue';
import GitProviderPlugin from './plugins/gitProvider';
import { initializeConfig } from './stores/configStore';
import { initSentryRenderer } from './lib/sentryRenderer';

initializeConfig().then(() => {
  const app = createApp(App);

  initSentryRenderer(app);

  app.use(GitProviderPlugin);

  app.mount('#app');
});
