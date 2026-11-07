import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/worker/index.ts",
      miniflare: {
        compatibilityDate: "2026-11-01",
        d1Databases: ["DB"],
        r2Buckets: ["MEDIA"],
        bindings: {
          PASSCODE_HASH:
            "sha256$MDEyMzQ1Njc4OWFiY2RlZg==$hwYMTXyyT1+b8zhK1rfNJSxvSfpEgpDKovqD/LVrClk=",
          API_TOKEN_HASH:
            "sha256$ZmVkY2JhOTg3NjU0MzIxMA==$MmpkxPFBuFDsanou1SXTh7jKYMVi9vAAYRpLK4KoC1A=",
          SESSION_SECRET: "test-session-secret",
          PUBLIC_ORIGIN: "http://example.com",
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    })),
  ],
  test: { include: ["tests/unit/**/*.spec.ts", "tests/worker/**/*.spec.ts"] },
});
