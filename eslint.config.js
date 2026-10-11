import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  js.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // `== null` is fine for "null or undefined"; otherwise ===.
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
    },
  },
]);
