import tseslint from 'typescript-eslint';

// Spec section 12.4: rules that keep hidden inputs out of src/core and browser services out of Ahead.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/ui', '**/ui/**', '**/data', '**/data/**', '**/store', '**/store/**'],
          message: 'core never imports from ui, data or store.',
        }],
      }],
      'no-restricted-properties': ['error',
        { object: 'Date', property: 'now', message: 'Pass now as an argument.' },
        { object: 'Math', property: 'random', message: 'Pass a seed as an argument.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Pass now as an argument.' },
        { selector: "CallExpression[callee.name='Date']", message: 'Pass now as an argument.' },
        { selector: "CallExpression[callee.property.name='resolvedOptions']", message: 'Pass zone data as an argument.' },
      ],
    },
  },
  {
    files: ['src/ui/strip/**', 'src/ui/cards/**', 'src/ui/ask/**', 'src/ui/demo/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/store', '**/store/**', '**/data', '**/data/**'],
          message: "Ahead's components read Screen and call the actions object.",
        }],
      }],
      'no-restricted-globals': ['error',
        { name: 'fetch', message: 'Use the actions object.' },
        { name: 'localStorage', message: 'Use the actions object.' },
        { name: 'indexedDB', message: 'Use the actions object.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'navigator', property: 'geolocation', message: 'Use the actions object.' },
        { object: 'navigator', property: 'share', message: 'Use the actions object.' },
        { object: 'navigator', property: 'clipboard', message: 'Use the actions object.' },
      ],
    },
  },
);
