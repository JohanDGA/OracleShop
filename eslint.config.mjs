import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    // No lintar artefactos ni generados
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/.expo/**",
      "**/web-build/**",
      "packages/db/supabase/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/babel.config.js",
      "**/metro.config.js",
      "**/expo-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // El proyecto prohíbe `any`
      "@typescript-eslint/no-explicit-any": "error",
      // Permitir variables sin usar con prefijo _
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // TypeScript ya valida símbolos no definidos; el core no-undef da
      // falsos positivos con tipos/JSX (recomendación de typescript-eslint).
      "no-undef": "off",
    },
  },
);
