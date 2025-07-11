import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
    // Base JavaScript rules
    js.configs.recommended,

    // TypeScript configuration for lib files
    {
        files: ['lib/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.json',
            },
            globals: {
                // Bun globals
                Bun: 'readonly',
                // Node.js globals for compatibility
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                structuredClone: 'readonly',
                // Node.js types
                NodeJS: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            // TypeScript-specific rules
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn', // Warn instead of error
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/require-await': 'warn', // Warn for async methods without await
            '@typescript-eslint/return-await': 'error',
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@typescript-eslint/no-import-type-side-effects': 'error',

            // Code quality rules
            'prefer-const': 'error',
            'no-var': 'error',
            'no-console': 'off', // Allow console in a logging library
            'no-debugger': 'error',
            'no-alert': 'error',
            'no-duplicate-imports': 'error',
            'no-useless-return': 'error',
            'prefer-template': 'error',
            'prefer-arrow-callback': 'error',
            'arrow-spacing': 'error',
            'comma-dangle': ['error', 'always-multiline'],
            'quote-props': ['error', 'as-needed'],

            // Performance and best practices for logging library
            'no-unused-expressions': 'error',
            'no-useless-concat': 'error',
            'no-regex-spaces': 'error',
            'prefer-rest-params': 'error',
            'prefer-spread': 'error',

            // Import/Export rules - relaxed for interface definitions
            'sort-imports': [
                'warn', // Change to warn to be less strict
                {
                    ignoreCase: true,
                    ignoreDeclarationSort: true,
                    ignoreMemberSort: false,
                    memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
                }
            ],

            // Relax some rules for interface/type definitions
            'no-unused-vars': 'off', // Use TypeScript version instead
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-empty-interface': 'off',
        },
    },

    // Test files configuration - without strict project requirement
    {
        files: ['test/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.test.json',
            },
            globals: {
                // Bun test globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                spyOn: 'readonly',
                // Bun globals
                Bun: 'readonly',
                // Node.js globals
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                structuredClone: 'readonly',
                process: 'readonly',
                // Node.js types
                NodeJS: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_|^(beforeEach|afterEach|describe|it|test|expect)$',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/require-await': 'off',
            'no-unused-vars': 'off', // Disable base rule, use TypeScript version
            'prefer-const': 'error',
            'no-var': 'error',
            'no-console': 'off',
            'comma-dangle': ['error', 'always-multiline'],
            'sort-imports': 'off', // Less strict for test files
        },
    },

    // Ignore patterns
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            '*.js',
            '*.mjs',
            '*.d.ts',
            'logs/**',
            'test-logs/**',
            'coverage/**',
        ],
    },
];
