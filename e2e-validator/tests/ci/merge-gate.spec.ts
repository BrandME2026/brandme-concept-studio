import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

/**
 * COV_CI_001: Merge Gate — @ci (P1)
 *
 * .1 "Un PR que rompe el aislamiento bloquea el merge con el ofensor nombrado".
 * Drill ejecutable del contrato: se corre el gate REAL (endpoint-registry,
 * parte de `pnpm test:all` en CI) contra una COPIA de src/app a la que se le
 * añade un endpoint sin clasificación de aislamiento — exactamente lo que
 * introduciría ese PR. Debe FALLAR nombrando la ruta. La copia evita mutar
 * src/ con el dev server del e2e corriendo. En un PR real esto ocurre en el
 * job `verify` de .github/workflows/ci.yml (required check en main).
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

test("@COV_CI_001.1 @ci — un endpoint sin protección declarada rompe el gate con nombre", () => {
  test.setTimeout(120_000);
  const tmpApp = join(mkdtempSync(join(tmpdir(), "ci-probe-")), "app");
  cpSync(join(REPO_ROOT, "src", "app"), tmpApp, { recursive: true });
  const probeDir = join(tmpApp, "api", "__ci-probe");
  mkdirSync(probeDir, { recursive: true });
  writeFileSync(
    join(probeDir, "route.ts"),
    `export async function GET() {\n  return new Response("probe");\n}\n`,
  );
  try {
    let output = "";
    let failed = false;
    try {
      output = execFileSync(
        "pnpm",
        ["exec", "vitest", "run", "--project", "db", "tests/db/endpoint-registry.test.ts"],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, ENDPOINT_REGISTRY_APP_DIR: tmpApp },
        },
      );
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    }
    expect(failed, "el gate DEBE fallar con un endpoint sin clasificar").toBe(true);
    expect(output, "el ofensor debe salir POR NOMBRE en el fallo").toContain("api/__ci-probe");
  } finally {
    rmSync(join(tmpApp, ".."), { recursive: true, force: true });
  }
});
