import { defineConfig } from 'vite';
import { resolve } from 'path';
import nodepod from '@scelar/nodepod/vite';

export default defineConfig({
  root: __dirname,
  plugins: [nodepod()], // API mode — no git: 'native'
  server: {
    port: 4568,
  },
});