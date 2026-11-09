import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Saya-no-Uta-Browser-Edition/',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { target: 'es2022' }
});
