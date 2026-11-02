import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // The command-line entry point is covered by the integration project, which runs it as a subprocess.
      include: ['src/core/**', 'src/node/**'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
