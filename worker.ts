/**
 * Cloudflare Workers entry: the OpenNext-generated app handler plus a scheduled handler that
 * runs booking reminders (cron in wrangler.jsonc) by calling the app's protected cron route.
 *
 * One-click deploys ("Deploy to Cloudflare") only ask the owner for ADMIN_PASSWORD. Anything
 * else that isn't set in Cloudflare is filled in here, before the app sees the request:
 *  - SESSION_SECRET, CRON_SECRET, TOKEN_ENCRYPTION_KEY: generated once, kept in the AppSecret table;
 *  - APP_URL: the address the site was opened on (also saved to Settings.siteUrl for the cron);
 *  - EMAIL_DELIVERY: "gmail" (emails stay in the outbox until Google is connected).
 * Values set in Cloudflare always win, so copies set up with `npm run setup` behave as before.
 */
// @ts-expect-error `.open-next/worker.js` is generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

type D1 = {
  prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> } };
};
type Ctx = { waitUntil(p: Promise<unknown>): void };
interface Env {
  [key: string]: unknown;
  DB: D1;
  WORKER_SELF_REFERENCE?: { fetch(input: Request): Promise<Response> };
  APP_URL?: string;
  CRON_SECRET?: string;
  SESSION_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  EMAIL_DELIVERY?: string;
  NEXTJS_ENV?: string;
}

const GENERATED = ["SESSION_SECRET", "CRON_SECRET", "TOKEN_ENCRYPTION_KEY"] as const;
let generated: Record<string, string> | null = null;
let savedOrigin = "";

function randomSecret(name: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes));
  // TOKEN_ENCRYPTION_KEY is read as standard base64; the others are opaque strings.
  return name === "TOKEN_ENCRYPTION_KEY" ? b64 : b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generated secrets, created on first use. Insert-or-ignore, then read back, so parallel first requests agree. */
async function loadGenerated(db: D1, missing: string[]) {
  if (generated && missing.every((k) => generated![k])) return generated;
  try {
    for (const name of missing) {
      await db.prepare(`INSERT OR IGNORE INTO "AppSecret" (name, value) VALUES (?, ?)`).bind(name, randomSecret(name)).run();
    }
    const { results } = await db.prepare(`SELECT name, value FROM "AppSecret"`).bind().all<{ name: string; value: string }>();
    generated = Object.fromEntries(results.map((r) => [r.name, r.value]));
  } catch (e) {
    // Tables not created yet (the very first seconds of a new deploy): leave them unset.
    console.error("Couldn't load generated secrets", e);
    generated = {};
  }
  return generated;
}

const isLocal = (host: string) => host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");

/** Remember the public address for the cron (and emails it sends). A custom domain beats workers.dev. */
function rememberOrigin(db: D1, origin: string, ctx: Ctx) {
  if (savedOrigin === origin || isLocal(new URL(origin).hostname)) return;
  savedOrigin = origin;
  ctx.waitUntil(
    db
      .prepare(
        `UPDATE "Settings" SET siteUrl = ?1 WHERE id = 1 AND (siteUrl IS NULL OR (siteUrl LIKE '%.workers.dev' AND ?1 NOT LIKE '%.workers.dev'))`,
      )
      .bind(origin)
      .run()
      .catch(() => {}),
  );
}

async function withDefaults(env: Env, origin: string | null, ctx: Ctx): Promise<Env> {
  // Local previews (NEXTJS_ENV=development in .dev.vars) take everything from .env.development.local,
  // including safe outbox-only email, so nothing is filled in here.
  if (env.NEXTJS_ENV === "development") return env;
  const missing = GENERATED.filter((k) => !env[k]);
  if (!missing.length && env.APP_URL && env.EMAIL_DELIVERY) return env;
  const out: Env = { ...env };
  if (missing.length) {
    const g = await loadGenerated(env.DB, missing);
    for (const k of missing) if (g[k]) out[k] = g[k];
  }
  if (!env.APP_URL && origin) {
    out.APP_URL = origin;
    rememberOrigin(env.DB, origin, ctx);
  }
  if (!env.EMAIL_DELIVERY) out.EMAIL_DELIVERY = "gmail";
  return out;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: Ctx) {
    const origin = env.APP_URL ? null : new URL(request.url).origin;
    return handler.fetch(request, await withDefaults(env, origin, ctx), ctx);
  },
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    let base = env.APP_URL;
    if (!base) {
      const row = await env.DB.prepare(`SELECT siteUrl FROM "Settings" WHERE id = 1`).bind().first<{ siteUrl: string | null }>().catch(() => null);
      base = row?.siteUrl ?? undefined;
    }
    if (!base) {
      console.log("reminders skipped: the site hasn't been opened yet, so its address isn't known");
      return;
    }
    const full = await withDefaults({ ...env, APP_URL: base }, null, ctx);
    const req = new Request(`${base}/api/cron/reminders`, { headers: { Authorization: `Bearer ${full.CRON_SECRET}` } });
    // The self-reference binding runs the cron as a normal request; without it, call the app directly.
    const run = env.WORKER_SELF_REFERENCE ? env.WORKER_SELF_REFERENCE.fetch(req) : handler.fetch(req, full, ctx);
    ctx.waitUntil(run.then(async (r: Response) => console.log("reminders", r.status, await r.text())));
  },
};

export default worker;
