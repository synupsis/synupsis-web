import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import { defineConfig } from 'eslint/config'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default defineConfig([
  {
    // Preserve the previous lint scope, including its exclusion of dotfolders.
    ignores: [
      '**/.*',
      '**/*.cjs',
      '**/*.mjs',
      'node_modules/',
      'dist/',
      'coverage/',
      'components/shadcn/**',
      'supabase/**',
      'types/generated/**',
    ],
  },
  {
    files: ['**/*.{js,ts,vue}'],
    extends: [js.configs.recommended, tsPlugin.configs['flat/recommended'], vue.configs['flat/essential']],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: tsParser },
    },
    rules: {
      // These checks were part of the previous recommended configuration.
      'no-extra-semi': 'error',
      'no-inner-declarations': 'error',
      'no-mixed-spaces-and-tabs': 'error',
      'no-class-assign': 'error',
      'no-with': 'error',
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
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
])
