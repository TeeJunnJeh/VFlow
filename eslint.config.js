import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'JSXText[value=/[\\u4E00-\\u9FFF]/]',
          message: 'Do not write Chinese literals directly in JSX text. Use i18n key via t.xxx.',
        },
        {
          selector: 'JSXAttribute[value.type="Literal"][value.value=/[\\u4E00-\\u9FFF]/]',
          message: 'Do not write Chinese literals directly in JSX attributes. Use i18n key via t.xxx.',
        },
      ],
    },
  },
])
