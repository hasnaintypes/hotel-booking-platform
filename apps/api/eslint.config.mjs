import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "no-undef": "off",
      // Use the Nest/pino logger in application code; the seed script and tests may use console.
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/database/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@hotel-booking/db",
              message:
                "Use a repository under src/database/repositories instead of importing the database package directly.",
            },
            {
              name: "mongoose",
              message: "MongoDB has been removed; use repositories backed by PostgreSQL.",
            },
            {
              name: "@nestjs/mongoose",
              message: "MongoDB has been removed; use repositories backed by PostgreSQL.",
            },
          ],
          patterns: [
            {
              group: ["../*/schemas/**", "../../*/schemas/**"],
              message:
                "Import another module's exported service or type instead of its internal schema.",
            },
            {
              group: ["../*/repositories/**"],
              message:
                "Import another module's exported service or type instead of its repository.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/bookings/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@hotel-booking/db",
              message:
                "Use a repository under src/database/repositories instead of importing the database package directly.",
            },
            {
              name: "mongoose",
              message: "MongoDB has been removed; use repositories backed by PostgreSQL.",
            },
            {
              name: "@nestjs/mongoose",
              message: "MongoDB has been removed; use repositories backed by PostgreSQL.",
            },
          ],
          patterns: [
            {
              group: ["../*/schemas/**", "../../*/schemas/**"],
              message:
                "Import another module's exported service or type instead of its internal schema.",
            },
            {
              group: ["../*/repositories/**"],
              message:
                "Import another module's exported service or type instead of its repository.",
            },
            {
              group: [
                "../inventory/providers/**",
                "../../modules/inventory/providers/**",
                "@hotel-booking/supplier-kit",
                "@hotel-booking/supplier-kit/**",
              ],
              message:
                "Booking code must depend on the InventoryProvider abstraction (OffersService), never a managed or supplier implementation (ADR-016).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/database/seeds/**/*.ts", "test/**/*.ts", "src/**/*.spec.ts"],
    rules: { "no-console": "off" },
  },
];
