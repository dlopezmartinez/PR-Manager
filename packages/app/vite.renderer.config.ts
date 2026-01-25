import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
	plugins: [
		vue(),
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
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src')
		}
	},
	build: {
		sourcemap: true,
	},
});
