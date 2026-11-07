/// <reference types="@cloudflare/workers-types" />
/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    PASSCODE_HASH: string;
    API_TOKEN_HASH: string;
    SESSION_SECRET: string;
    PUBLIC_ORIGIN: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
