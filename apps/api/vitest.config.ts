import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    // DB-integration specs share one Postgres — run files sequentially to avoid races.
    fileParallelism: false,
  },
});
