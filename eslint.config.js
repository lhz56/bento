import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'dist-web/**',
      'release/**',
      'smoke-out/**',
      'build/**',
      'ios/**',
      'public/**',
      'site/media/**',
    ],
  },
  js.configs.recommended,
  {
    // The React app (renderer) and its web workers.
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.worker },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // The Electron main process (CommonJS).
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // Build scripts, tests and tooling (ES modules on Node). Smoke tests and recorders also pass
    // functions into the app's page (page.evaluate), so browser globals are allowed there too.
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', '*.js', 'electron/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // The marketing site.
    files: ['site/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
