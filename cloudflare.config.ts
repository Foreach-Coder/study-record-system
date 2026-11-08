import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig({
  accountId: "35901558adbf4d9f8c0e3ef3412540c2",
  worker: {
    name: "study-record",
    entrypoint,
    compatibilityDate: "2026-11-01",
    env: {
      DB: bindings.d1({ id: "a2f9ad05-48a3-4f35-93c8-008c1bc46d35", name: "study-record-db" }),
      MEDIA: bindings.r2({ name: "study-record-media" }),
      PASSCODE_HASH: bindings.secret(),
      SESSION_SECRET: bindings.secret(),
      API_TOKEN_HASH: bindings.secret(),
      PUBLIC_ORIGIN: bindings.text("https://study-record.foreach.me"),
    },
    domains: ["study-record.foreach.me"],
    assets: { notFoundHandling: "single-page-application" },
  },
});
