import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/back-order-dashboard/**'],
    coverage: {
      provider: 'v8',
      include: ['utils/**', 'hooks/**'],
    },
  },
});
