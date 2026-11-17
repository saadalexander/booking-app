/**
 * Cloudflare Workers entry: the OpenNext-generated app handler plus a scheduled handler that
 * runs booking reminders (cron in wrangler.jsonc) by calling the app's protected cron route
 * through the worker's own service binding.
 */
// @ts-expect-error `.open-next/worker.js` is generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

interface Env {
  WORKER_SELF_REFERENCE: { fetch(input: string, init?: RequestInit): Promise<Response> };
  CRON_SECRET: string;
  APP_URL: string;
}

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch(`${env.APP_URL}/api/cron/reminders`, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      }).then(async (r) => console.log("reminders", r.status, await r.text())),
    );
  },
};
