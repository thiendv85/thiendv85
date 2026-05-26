import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/', 'node_modules/', 'back-order-dashboard/', 'scratch/', 'streamlit_apps/', '**/*.cjs', '*.js', '*.mjs', 'scripts/', 'supabase/'] },

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Promise: 'readonly',
        Intl: 'readonly',
        AbortController: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        performance: 'readonly',
        structuredClone: 'readonly',
        crypto: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        process: 'readonly',
        globalThis: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // TypeScript
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',

      // React hooks — keep rules-of-hooks as warning, disable compiler checks
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/react-compiler': 'off',

      // React refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // General quality
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-misleading-character-class': 'warn',
      'no-useless-assignment': 'warn',
      'no-irregular-whitespace': 'warn',
    },
  },

  // Test files — relax
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
