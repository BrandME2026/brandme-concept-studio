import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// WO-3: el acceso a Postgres pasa SIEMPRE por la capa de contexto de tenant.
// Importar `pg` fuera de src/lib/db rompe la garantía RLS.
const restrictedPg = {
  name: "pg",
  message:
    "Acceso a Postgres solo vía db() dentro de withTenant()/withSystemContext() (src/lib/db/tenant-context.ts).",
};

// WO-5 (blueprint FirebaseAuthAdapter, ADR-001): el SDK de Firebase Auth vive
// SOLO dentro del adapter (src/lib/auth = server + client context; src/lib/
// firebase = init del client SDK). Así el provider es swappable en un punto.
const restrictedFirebaseAuth = {
  group: ["firebase/auth"],
  message:
    "Firebase Auth solo dentro del FirebaseAuthAdapter (src/lib/auth/**, src/lib/firebase/**).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**", "src/lib/auth/**", "src/lib/firebase/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [restrictedPg], patterns: [restrictedFirebaseAuth] },
      ],
    },
  },
  // Dentro del adapter: firebase/auth permitido, pg sigue prohibido.
  {
    files: ["src/lib/auth/**/*.{ts,tsx}", "src/lib/firebase/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: [restrictedPg] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
