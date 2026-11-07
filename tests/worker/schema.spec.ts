import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

type TestEnv = typeof env & {
  TEST_MIGRATIONS: { name: string; queries: string[] }[];
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
});

describe("schema", () => {
  it("creates every table at version 1", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "children",
        "tasks",
        "behaviors",
        "audit_log",
        "auth_attempts",
        "schema_meta",
      ]),
    );

    const meta = await env.DB.prepare(
      "SELECT version FROM schema_meta WHERE id = 1",
    ).first<{ version: number }>();
    expect(meta?.version).toBe(1);
  });
});
