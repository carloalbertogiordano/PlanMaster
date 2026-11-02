import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['test/**/*.test.ts'],
      exclude: ['test/integration/**'],
      environment: 'node',
      // Unit tests are meant to be fast: a test that needs more than a second is in the wrong project.
      testTimeout: 1000,
    },
  },
  {
    test: {
      name: 'integration',
      include: ['test/integration/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
]);
