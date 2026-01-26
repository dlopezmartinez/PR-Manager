/// <reference types="vite/client" />
declare module '*.css';

import './styles/theme.css';
import './index.css';
import { createApp } from 'vue';
import AppWrapper from './AppWrapper.vue';
import GitProviderPlugin from './plugins/gitProvider';
import { initSentryRenderer } from './lib/sentryRenderer';

// On macOS, we use AppWrapper which shows KeychainAuthScreen first
// before loading App.vue (which triggers Keychain access via stores)
// On other platforms, AppWrapper loads App.vue immediately
const app = createApp(AppWrapper);
initSentryRenderer(app);
app.use(GitProviderPlugin);
app.mount('#app');
