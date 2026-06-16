import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    // Generados / artefactos / datos — no se lintean.
    ignores: [
      "node_modules/**",
      ".next/**",
      ".data/**",
      ".data*/**",
      "next-env.d.ts",
      "lib/flexo-prompts-generated.ts",
      "design-system/**",
      "mercadeo/**",
      "scratch/**",
      "scripts/test-*.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // El código usa `any` deliberadamente en catch y en shims de red/SAP.
      "@typescript-eslint/no-explicit-any": "off",
      // step1 carga pdf-parse vía require() para evitar el side-effect de su index.
      "@typescript-eslint/no-require-imports": "off",
      // Variables/args sin usar: error, pero se permite el prefijo `_` para descartes.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
);
