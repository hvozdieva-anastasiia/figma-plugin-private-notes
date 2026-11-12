import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'node_modules/**',
      'coverage/**',
      '.agents/**',
      'work/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tooling/**/*.mjs', '*.mjs', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.vitest } },
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  {
    files: ['experiments/private-notes/ui.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/plugin/**/*.ts', 'experiments/**/plugin.ts'],
    languageOptions: {
      globals: {
        figma: 'readonly',
        __html__: 'readonly',
        __uiFiles__: 'readonly',
        console: 'readonly',
      },
    },
  },
);
