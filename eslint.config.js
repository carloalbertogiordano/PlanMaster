import js from '@eslint/js';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  sonarjs.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-nested-callbacks': ['error', 3],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'sonarjs/cognitive-complexity': ['error', 12],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
    },
  },
);
