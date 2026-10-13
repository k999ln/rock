import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['services/sky-agent-runtime/test/**/*.test.mjs'],
    testTimeout: 20_000,
  },
});
