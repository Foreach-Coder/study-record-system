import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig({
  accountId: "35901558adbf4d9f8c0e3ef3412540c2",
  worker: {
    name: "study-record-preview",
    entrypoint,
    compatibilityDate: "2026-11-01",
    env: {
      DB: bindings.d1({ id: "ffc1dc5a-51de-405f-b26c-c9b3dc164233", name: "study-record-preview-db" }),
      MEDIA: bindings.r2({ name: "study-record-preview-media" }),
      PASSCODE_HASH: bindings.secret(),
      SESSION_SECRET: bindings.secret(),
      API_TOKEN_HASH: bindings.secret(),
      PUBLIC_ORIGIN: bindings.text("https://study-record-preview.foreach.me"),
    },
    domains: ["study-record-preview.foreach.me"],
    assets: { notFoundHandling: "single-page-application" },
  },
});
