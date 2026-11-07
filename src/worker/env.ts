export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  PASSCODE_HASH: string;
  SESSION_SECRET: string;
  API_TOKEN_HASH: string;
  PUBLIC_ORIGIN: string;
}
