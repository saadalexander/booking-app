#!/usr/bin/env node
/**
 * `npm run deploy`: the deploy command Cloudflare runs for copies made with the
 * "Deploy to Cloudflare" button (Workers Builds), on the first deploy and after every update.
 *
 *  1. Makes sure the database and file storage named in wrangler.jsonc exist (creates them if not).
 *  2. Builds the Cloudflare version (reusing the `npm run build` output when there is one).
 *  3. Applies new database changes (d1-migrations/), then deploys.
 *
 * On your own computer, use `npm run setup -- cloudflare` and `npm run update` instead.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

process.chdir(path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."));
const say = (s) => console.log(s);
const fail = (s) => {
  console.error(`\n✗ ${s}`);
  process.exit(1);
};
const run = (cmd, args, env = {}) => {
  say(`\n$ ${[cmd, ...args].join(" ")}`);
  return spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } }).status === 0;
};
const capture = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

if (!existsSync("wrangler.jsonc")) fail("No wrangler.jsonc. On your own computer, run `npm run setup -- cloudflare` instead.");
let config = readFileSync("wrangler.jsonc", "utf8");
const dbName = config.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
const bucket = config.match(/"bucket_name"\s*:\s*"([^"]+)"/)?.[1];
if (!dbName) fail("wrangler.jsonc has no database_name.");

// 1. Database: find it by name (or create it) and note its id for the migration step.
if (!/"database_id"\s*:\s*"[0-9a-f-]{36}"/.test(config)) {
  const find = () => {
    const r = capture("npx", ["wrangler", "d1", "list", "--json"]);
    try {
      return JSON.parse(r.out.slice(r.out.indexOf("["))).find((d) => d.name === dbName)?.uuid ?? null;
    } catch {
      return null;
    }
  };
  let id = find();
  if (!id) {
    say(`Creating your database "${dbName}"…`);
    if (!run("npx", ["wrangler", "d1", "create", dbName])) fail("Creating the database failed.");
    id = find();
  }
  if (!id) fail(`Couldn't find the database "${dbName}".`);
  // Only in this build's working copy: your repository isn't changed.
  config = config.replace(/("database_name"\s*:\s*"[^"]+")/, `$1, "database_id": "${id}"`);
  writeFileSync("wrangler.jsonc", config);
}

// File storage for client uploads. R2 has to be switched on once per Cloudflare account.
if (bucket) {
  const r = capture("npx", ["wrangler", "r2", "bucket", "create", bucket]);
  if (!r.ok && !/already exists|already own/i.test(r.out)) {
    say(r.out);
    fail("Couldn't create file storage (R2). In the Cloudflare dashboard, open R2 Object Storage and switch it on (the free tier is plenty), then click Retry build.");
  }
}

// 2. Build. On Workers Builds (WORKERS_CI=1) the build step's `npm run build` already built Next.js in
// Cloudflare mode (see next.config.ts), so only the Workers bundle is left; otherwise build it all.
const built = existsSync(".next/standalone") && process.env.WORKERS_CI === "1";
if (!run("npx", ["opennextjs-cloudflare", "build", ...(built ? ["--skipNextBuild"] : [])], { CF_BUILD: "1" })) fail("Build failed.");

// 3. Database changes, then the new version.
if (!run("npx", ["wrangler", "d1", "migrations", "apply", dbName, "--remote"])) fail("Applying database changes failed.");
if (!run("npx", ["opennextjs-cloudflare", "deploy"])) fail("Deploy failed.");
say("\n✓ Deployed. Open your site's address and go to /admin to sign in.");
