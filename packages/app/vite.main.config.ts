import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  // Load env variables for the main process
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      // Sentry source maps upload (only in production build)
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        disable: !process.env.SENTRY_AUTH_TOKEN,
        release: {
          name: `pr-manager@${process.env.npm_package_version || '0.1.0'}`,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ['**/*.js.map'],
        },
      }),
    ],
    define: {
      // Pass Sentry DSN to main process
      'process.env.SENTRY_DSN': JSON.stringify(env.VITE_SENTRY_DSN || ''),
      'process.env.SENTRY_ENABLED': JSON.stringify(env.VITE_SENTRY_ENABLED || 'false'),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      sourcemap: true,
    },
  };
});
