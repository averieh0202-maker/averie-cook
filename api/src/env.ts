export type Env = {
  DB: D1Database;
  MEDIA?: KVNamespace;
  COVERS?: R2Bucket;
  OWNER_PASSWORD: string;
  OWNER_SESSION_SECRET: string;
  INGEST_SECRET: string;
  ASSET_BASE_URL: string;
  ENVIRONMENT: string;
};
