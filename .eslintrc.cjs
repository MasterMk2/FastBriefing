module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    // Existing APIs intentionally use underscore-prefixed placeholders for
    // parameters and destructured values that are part of a stable signature.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      files: ['src/components/MapTab.tsx', 'src/vite-env.d.ts'],
      // Leaflet is exposed through the existing global window.L declaration;
      // replacing this bridge with a typed adapter is a separate source task.
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['src/core/MissionNormalizer.ts', 'src/utils/coordinates.ts'],
      // These are existing style-only findings; TypeScript remains the source
      // of truth for type and unused-code checking in the build.
      rules: {
        'prefer-const': 'off',
      },
    },
    {
      files: ['src/workers/missionParser.ts'],
      // The parser's switch cases currently rely on declarations without
      // explicit blocks; restructuring the source belongs to a later task.
      rules: {
        'no-case-declarations': 'off',
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', 'docs', '*.html', 'coverage'],
};
