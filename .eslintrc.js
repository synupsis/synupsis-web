module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    es6: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  ignorePatterns: [
    '.nuxt/',
    'node_modules/',
    'dist/',
    'coverage/',
    'components/shadcn/**',
    'supabase/**',
    'types/database-generated.types.ts'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly'
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    parser: '@typescript-eslint/parser',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'vue'],
  rules: {
    indent: 'off',
    'linebreak-style': 'off',
    quotes: 'off',
    semi: 'off',
    curly: 'off',
    'no-undef': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'vue/multi-word-component-names': 'off',
    'vue/attributes-order': 'off',
    'vue/first-attribute-linebreak': 'off',
    'vue/html-indent': 'off',
    'vue/html-self-closing': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/multiline-html-element-content-newline': 'off',
    'vue/no-v-html': 'off',
    'vue/no-v-text-v-html-on-component': 'off',
    'vue/singleline-html-element-content-newline': 'off'
  }
};
