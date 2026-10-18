/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CSP_META } from './security/headers.mjs';

const csp = (): Plugin => ({
  name: 'aegis-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`),
});

export default defineConfig({
  plugins: [react(), csp()],
  build: { sourcemap: false, target: 'es2022' },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
