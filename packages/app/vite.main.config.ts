import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  // Load env variables for the main process
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      // Pass Sentry DSN to main process
      'process.env.SENTRY_DSN': JSON.stringify(env.VITE_SENTRY_DSN || ''),
      'process.env.SENTRY_ENABLED': JSON.stringify(env.VITE_SENTRY_ENABLED || 'false'),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});
