import { defineConfig } from 'vite';
import { resolve } from 'path';
import nodepod from '@scelar/nodepod/vite';

export default defineConfig({
  root: __dirname,
  plugins: [nodepod({ git: 'native' })],
  server: {
    port: 4567
  }
});