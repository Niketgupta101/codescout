const eslintJs = require("@eslint/js");
const typescriptEslint = require("typescript-eslint");
const eslintPluginJest = require("eslint-plugin-jest");
const eslintPluginUnusedImports = require("eslint-plugin-unused-imports");
const eslintConfigPrettier = require("eslint-config-prettier");
const globals = require("globals");

/** @type import("eslint").Linter.Config[] */
module.exports = [
  // global ignores
  // see https://eslint.org/docs/latest/use/configure/ignore#ignoring-files
  {
    ignores: [
      "eslint.config.js",
      "node_modules",
      "package-lock.json",
      "yarn.lock",
      ".gen",
      ".expo",
      ".idea",
      "assets",
      "build",
      "coverage",
      "dist",
    ],
  },

  // eslint recommended
  // see https://www.npmjs.com/package/@eslint/js
  eslintJs.configs.recommended,

  // typescript eslint strict type checked for source files
  // see https://typescript-eslint.io/users/configs#projects-with-type-checking
  ...typescriptEslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx,mtsx}"],
    ignores: ["**/*.?(e2e-)spec.{ts,tsx,mtsx,d.ts}"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  })),

  // typescript eslint recommended type checked for spec files
  // see https://typescript-eslint.io/users/configs#projects-with-type-checking
  ...typescriptEslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.?(e2e-)spec.{ts,tsx,mtsx,d.ts}"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  })),

  // typescript eslint stylistic type checked for source and spec files
  // see https://typescript-eslint.io/users/configs#projects-with-type-checking
  ...typescriptEslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx,mtsx}"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  })),

  // eslint jest
  // see https://www.npmjs.com/package/eslint-plugin-jest
  eslintPluginJest.configs["flat/recommended"],

  // eslint prettier
  // see https://prettier.io/docs/en/integrating-with-linters.html
  eslintConfigPrettier,

  // common configuration
  {
    plugins: {
      "@typescript-eslint": typescriptEslint.plugin,
      "unused-imports": eslintPluginUnusedImports,
    },
    rules: {
      // use plugin `unused-imports` instead of `no-unused-vars` to auto fix unused imports
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // overrides for typescript source files
  {
    files: ["**/*.{ts,tsx,mtsx}"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    rules: {
      // allow non null assertions
      "@typescript-eslint/no-non-null-assertion": "off",

      // allow last value in union types to be explictly checked
      "@typescript-eslint/no-unnecessary-condition": "off",

      // allow both types and interfaces
      "@typescript-eslint/consistent-type-definitions": "off",

      // allow empty classes
      "@typescript-eslint/no-extraneous-class": "off",

      // allow empty objects and interfaces
      "@typescript-eslint/no-empty-object-type": "off",

      // allow non error rejection reasons
      "@typescript-eslint/prefer-promise-reject-errors": "off",

      // allow void type for unbound function `this`
      "@typescript-eslint/no-invalid-void-type": "off",

      // allow both record and index signature styles
      "@typescript-eslint/consistent-indexed-object-style": "off",

      // allow generic parameters used for type inference
      "@typescript-eslint/no-unnecessary-type-parameters": "off",

      // allow async functions without any await expressions
      "@typescript-eslint/require-await": "off",

      // allow void type to be used
      "@typescript-eslint/no-confusing-void-expression": "off",

      // do not use regexp exec, prefer string match instead
      "@typescript-eslint/prefer-regexp-exec": "off",

      // do not use reduce type parameter as it is hard to read
      "@typescript-eslint/prefer-reduce-type-parameter": "off",

      // allow types in template expressions
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: false,
          allowBoolean: true,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: true,
          allowNever: false,
        },
      ],

      // allow namespaces when declaring external module types
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],

      // allow deprecated but add warning
      "@typescript-eslint/no-deprecated": "warn",

      // allow empty functions for constructors where necessary
      "@typescript-eslint/no-empty-function": [
        "error",
        {
          allow: ["private-constructors", "protected-constructors", "decoratedFunctions", "overrideMethods"],
        },
      ],

      // use plugin `unused-imports` instead of `@typescript-eslint/no-unused-vars` to auto fix unused imports
      "@typescript-eslint/no-unused-vars": "off",

      // allow spread operator on class instances (DTOs)
      "@typescript-eslint/no-misused-spread": "off",
    },
  },

  // overrides for typescript spec files
  {
    files: ["**/*.?(e2e-)spec.{ts,tsx,mtsx,d.ts}"],
    rules: {
      // allow unbound methods in tests
      "@typescript-eslint/unbound-method": "off",

      // allow jest to detect unbound methods
      "jest/unbound-method": "error",
    },
  },

  // overrides for typescript e2e spec files
  {
    files: ["**/*.e2e-spec.{ts,tsx,mtsx,d.ts}"],
    rules: {
      // allow tests without expect as superagent is used
      "jest/expect-expect": "off",
    },
  },

  // common configuration
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
