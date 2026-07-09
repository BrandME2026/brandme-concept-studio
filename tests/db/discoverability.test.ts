import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAndMigrate } from "./harness";
import { withMigrator } from "./db-util";
import { invalidateConfigCache } from "../../src/lib/config/config-store";
import {
  getPlatformPhase,
  phaseStatement,
} from "../../src/lib/discoverability/platform-phase";
import { logCrawlerAccess } from "../../src/lib/discoverability/crawler-log";

/**
 * WO-41: fase de plataforma (REQ-SKL-002) y crawler access logging (REQ-SKL-001).
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

async function setPhase(valueJson: string | null) {
  await withMigrator((c) =>
    c.query(
      `UPDATE platform_config SET current_value = $1::jsonb
       WHERE feature_area = 'discoverability' AND config_key = 'platform_phase'`,
      [valueJson],
    ),
  );
  invalidateConfigCache();
}

beforeAll(async () => {
  await resetAndMigrate();
});

beforeEach(() => {
  invalidateConfigCache();
});

describe("PLATFORM_PHASE (REQ-SKL-002)", () => {
  it("default sembrado: closed_development", async () => {
    expect(await getPlatformPhase()).toBe("closed_development");
  });

  it("el admin la cambia sin deploy y un valor inválido cae a la fase más restrictiva", async () => {
    await setPhase('"friendly_beta"');
    expect(await getPlatformPhase()).toBe("friendly_beta");
    await setPhase('"fase-inventada"');
    expect(await getPlatformPhase()).toBe("closed_development"); // fail-closed
    await setPhase(null);
  });

  it("cada fase tiene su status statement", () => {
    expect(phaseStatement("closed_development")).toContain("closed development");
    expect(phaseStatement("friendly_beta")).toContain("friendly beta");
    expect(phaseStatement("public_mvp")).toContain("publicly available");
  });
});

describe("CrawlerAccessLogger (REQ-SKL-001)", () => {
  it("registra path, user-agent crudo, clasificación y referrer", async () => {
    const req = new Request("http://x.local/llms.txt", {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
        referer: "https://chat.openai.com/",
      },
    });
    logCrawlerAccess(req, "/llms.txt");
    await vi.waitFor(async () => {
      const { rows } = await withMigrator((c) =>
        c.query(
          `SELECT path, user_agent, crawler_name, referrer FROM crawler_access_logs
           WHERE path = '/llms.txt' ORDER BY created_at DESC LIMIT 1`,
        ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].crawler_name).toBe("GPTBot"); // clasificado vía config EP-07
      expect(rows[0].user_agent).toContain("GPTBot/1.2");
      expect(rows[0].referrer).toBe("https://chat.openai.com/");
    });
  });

  it("un user-agent no reconocido se guarda con crawler_name NULL", async () => {
    const req = new Request("http://x.local/llms.txt", {
      headers: { "user-agent": "curl/8.5.0" },
    });
    logCrawlerAccess(req, "/.well-known/skills/index.json");
    await vi.waitFor(async () => {
      const { rows } = await withMigrator((c) =>
        c.query(
          `SELECT crawler_name FROM crawler_access_logs
           WHERE path = '/.well-known/skills/index.json' ORDER BY created_at DESC LIMIT 1`,
        ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].crawler_name).toBeNull();
    });
  });
});
