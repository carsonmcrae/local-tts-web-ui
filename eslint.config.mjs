// @ts-check
/**
 * Purpose: ESLint flat config for all TypeScript/JavaScript in the repository.
 * Scope: Type-aware typescript-eslint rules, React hooks, jsx-a11y, complexity and size limits, and
 *   project guards (no bare-name child processes, no Math.random, no default-export misuse).
 * Does NOT belong: Formatting (Prettier) or Python linting (ruff, configured in pyproject.toml).
 */
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/server/**',
      'apps/chatterbox-worker/**',
      '.tools/**',
      '.claude/**', // Claude Code worktrees: full checkouts of other branches
      'data/**',
      'playwright-report/**',
      'test-results/**',
      'apps/web/src/api/schema.gen.ts',
      'apps/web/public/**',
      'apps/desktop/runtime/**',
      'apps/desktop/src-tauri/target/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', 4],
      'max-params': ['error', { max: 6 }],
      'max-lines': ['error', { max: 500, skipBlankLines: false, skipComments: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Math.random is not allowed; use crypto.getRandomValues or a deterministic value.',
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error', 'log'] }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      // Type-only cast: the plugin's own typings nest `configs.flat`, which ESLint's Plugin type
      // does not allow; the runtime object is a valid plugin.
      'react-hooks': /** @type {import('eslint').ESLint.Plugin} */ (reactHooks),
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'no-console': 'error',
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
  {
    // React components: JSX conditionals count toward cyclomatic complexity and Prettier wraps
    // JSX generously, so components get a slightly higher, still enforced, ceiling than logic.
    files: ['apps/web/src/**/*.tsx'],
    rules: {
      complexity: ['error', { max: 20 }],
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // The public website's scripts run in the visitor's browser.
    files: ['site/**/*.js', 'apps/desktop/splash/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/web/src/**/*.test.{ts,tsx}', 'apps/web/src/test/**', 'tests/**'],
    rules: { 'max-lines-per-function': 'off', '@typescript-eslint/no-floating-promises': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^(spawn|spawnSync|execFile|execFileSync)$/] > Literal:first-child[value=/^(taskkill|npm|npx|node)$/]',
          message:
            'Spawn tools by absolute path (or process.execPath) so a planted binary on PATH is never used.',
        },
      ],
    },
  },
);
