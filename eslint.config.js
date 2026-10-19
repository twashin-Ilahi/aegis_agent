import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config({ ignores: ['dist', 'node_modules', 'scripts'] }, js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
  plugins: { 'react-hooks': reactHooks },
  rules: {
    ...reactHooks.configs.recommended.rules,
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-restricted-syntax': [
      'error',
      { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Raw HTML injection is forbidden (XSS).' },
      { selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]', message: 'Raw HTML injection is forbidden (XSS).' },
      { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'Raw HTML injection is forbidden (XSS).' },
    ],
  },
});
