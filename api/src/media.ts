import type { Env } from "./env";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const SEED_COVER_FILENAME = "2026-09-14-chicken-pumpkin-risotto.jpg";
export const SEED_COVER_PATH = `covers/${SEED_COVER_FILENAME}`;

export function sniffImage(buf: Uint8Array): { ext: "jpg" | "png" | "webp"; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  const riff = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  const webp = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
  if (riff === "RIFF" && webp === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export function isMediaFilename(name: string): boolean {
  return /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(name);
}

export async function putMedia(env: Env, filename: string, bytes: Uint8Array, mime: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO media_objects (id, mime, body, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(filename, mime, bytes, now)
    .run();

  if (env.MEDIA) {
    const existing = await env.MEDIA.get(`media:${filename}`);
    if (!existing) {
      await env.MEDIA.put(`media:${filename}`, bytes, { metadata: { mime } });
    }
  }
  if (env.COVERS) {
    const existing = await env.COVERS.head(`media:${filename}`);
    if (!existing) {
      await env.COVERS.put(`media:${filename}`, bytes, {
        httpMetadata: { contentType: mime },
      });
    }
  }
}

export async function getMedia(
  env: Env,
  filename: string,
): Promise<{ body: ArrayBuffer; mime: string } | null> {
  if (env.MEDIA) {
    const rec = await env.MEDIA.getWithMetadata<{ mime?: string }>(`media:${filename}`, "arrayBuffer");
    if (rec.value) {
      return { body: rec.value, mime: rec.metadata?.mime || "application/octet-stream" };
    }
  }
  if (env.COVERS) {
    const obj = await env.COVERS.get(`media:${filename}`);
    if (obj) {
      const body = await obj.arrayBuffer();
      const mime = obj.httpMetadata?.contentType || "application/octet-stream";
      return { body, mime };
    }
  }
  const row = await env.DB.prepare("SELECT mime, body FROM media_objects WHERE id = ?")
    .bind(filename)
    .first<{ mime: string; body: ArrayBuffer }>();
  if (!row) return null;
  return { body: row.body, mime: row.mime };
}

export function mediaResponse(body: ArrayBuffer, mime: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      "Content-Length": String(body.byteLength),
    },
  });
}
