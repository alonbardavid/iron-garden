// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import moduleLoggerName from "./eslint-rules/module-logger-name.mjs";

export default defineConfig(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/.wrangler/",
      "apps/backend/public/",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
      },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        require: "readonly",
        exports: "writable",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  {
    files: ["apps/backend/src/**/*.ts", "libs/*/src/**/*.ts"],
    plugins: { local: moduleLoggerName },
    rules: {
      "local/module-logger-name": "error",
    },
  },
  {
    // Server code logs through @lib/logging, which is the one place that
    // configures LogTape and reaches the console.
    files: ["apps/backend/src/**/*.ts", "libs/*/src/**/*.ts"],
    ignores: [
      "libs/logging/src/**",
      "libs/server-commons/src/http-logger-middleware.ts",
    ],
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@logtape/*"],
              message:
                'Log through @lib/logging (moduleLogger("<package>/<file>")) instead of importing LogTape directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // A promise returned unawaited from a `using` scope runs after the scope
    // has disposed its resource: an RPC stub such as an Artifacts repository
    // then fails mid-call with "RPC stub used after being disposed".
    files: ["apps/backend/src/**/*.ts", "libs/*/src/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
    },
  },
  {
    files: ["**/*.tsx", "**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='React']",
          message: "Use named imports from 'react' instead of React.xxx.",
        },
      ],
    },
  },
  {
    // A fixed color stays the same in the dark scheme; the palette's tokens
    // are CSS variables that follow it. This repeats the React rule because a
    // later no-restricted-syntax replaces an earlier one.
    files: ["apps/frontend/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='React']",
          message: "Use named imports from 'react' instead of React.xxx.",
        },
        {
          selector:
            "Literal[value=/#[0-9a-fA-F]{6}/], TemplateElement[value.raw=/#[0-9a-fA-F]{6}/]",
          message:
            "Use a palette token from @lib/ds (add one to libs/ds/src/palette.ts with a light and a dark value) instead of a hex color.",
        },
      ],
    },
  },
  eslintConfigPrettier,
);
