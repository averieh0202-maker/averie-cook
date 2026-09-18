/**
 * Shared Pages Function adapter for the existing Hono app.
 *
 * Layout choice: path-scoped Functions (`/api/*` + `/health`) rather than
 * advanced-mode `_worker.js`. Static files (`/`, `/data/*`, `/covers/*`) stay
 * on the Pages CDN, so the anonymous snapshot still loads if Functions fail.
 */
import type { Env } from "../api/src/env";
import app from "../api/src/index";

export const onRequest: PagesFunction<Env> = (context) =>
  app.fetch(context.request, context.env, {
    waitUntil: (p: Promise<unknown>) => context.waitUntil(p),
    passThroughOnException: () => context.passThroughOnException(),
    props: {},
  });
