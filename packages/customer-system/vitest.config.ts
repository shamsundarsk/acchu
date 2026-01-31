import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@sps/shared-types': resolve(__dirname, '../shared-types/src'),
    },
  },
});