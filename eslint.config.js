import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import noUntranslatedJsxText from './apps/web/eslint/no-untranslated-jsx-text.js'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.tsx'],
    plugins: {
      tripboard: {
        rules: {
          'no-untranslated-jsx-text': noUntranslatedJsxText,
        },
      },
    },
    rules: {
      'tripboard/no-untranslated-jsx-text': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'docs/**',
      'requirements/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
)
