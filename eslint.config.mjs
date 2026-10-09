import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// The service-role Supabase client bypasses RLS. Only privileged code paths
// (cron jobs, one-click token links, admin pages, server-only services) may
// import it. See docs/IMPLEMENTATION_PLAN.md §2.1.
const SERVICE_CLIENT_ALLOWED = [
  "src/lib/supabase/service.ts",
  "src/lib/analytics.ts",
  "src/app/api/cron/**",
  "src/app/r/**",
  "src/app/admin/**",
  "src/server/**",
  "scripts/**",
  "tests/**",
];

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "src/types/db.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    ignores: SERVICE_CLIENT_ALLOWED,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/service", "**/lib/supabase/service", "**/supabase/service"],
              message:
                "The service-role client bypasses RLS. Import it only from cron, token-link, admin, or src/server code (see IMPLEMENTATION_PLAN §2.1).",
            },
          ],
        },
      ],
    },
  },
  prettier,
];

export default eslintConfig;
