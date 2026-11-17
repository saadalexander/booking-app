#!/usr/bin/env node
/**
 * Set up your own copy of the booking app.
 *
 *   npm run setup -- local        Run it on your computer (http://localhost:3000)
 *   npm run setup -- cloudflare   Put your own copy online on Cloudflare (database, file storage,
 *                                 secrets, first deploy)
 *   npm run update                After pulling a new version: apply database changes and redeploy
 *
 * Nothing here touches anyone else's site or data: every copy gets its own database, storage and
 * secrets. Generated passwords are printed once and saved in secrets/ (git-ignored).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.chdir(ROOT);
// Answers come from the keyboard, or (for scripted setups) from piped lines: `printf 'a\nb\n' | npm run setup -- local`.
const piped = stdin.isTTY ? null : readFileSync(0, "utf8").split(/\r?\n/);
const rl = piped ? null : createInterface({ input: stdin, output: stdout });
const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith("-"));
const force = args.includes("--force");

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const say = (s = "") => console.log(s);
const fail = (s) => {
  console.error(`\n✗ ${s}`);
  process.exit(1);
};

async function ask(question, fallback = "") {
  const hint = fallback ? ` (${fallback})` : "";
  let a;
  if (piped) {
    a = (piped.shift() ?? "").trim();
    say(`${question}${hint}: ${a}`);
  } else a = (await rl.question(`${question}${hint}: `)).trim();
  return a || fallback;
}

/** Run a command, showing its output. Returns true on success. */
function run(cmd, cmdArgs, opts = {}) {
  say(`\n$ ${[cmd, ...cmdArgs].join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  return r.status === 0;
}
/** Run a command quietly and return its output. */
function capture(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const npx = (...a) => run("npx", a);

const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");
const password = () => randomBytes(12).toString("base64url");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "booking";
const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;
const id = (prefix) => prefix + randomBytes(10).toString("hex");

function saveSecret(file, text) {
  mkdirSync("secrets", { recursive: true });
  writeFileSync(path.join("secrets", file), text);
  chmodSync(path.join("secrets", file), 0o600);
}

async function askOwner() {
  say(bold("\nAbout you (you can change all of this later in the dashboard → Settings)"));
  const businessName = await ask("Business name", "My Coaching");
  const ownerName = await ask("Your first name", "Alex");
  let ownerEmail = "";
  while (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    ownerEmail = await ask("Your email (booking notifications go here)");
    if (piped && !ownerEmail) fail("An email address is needed.");
  }
  const timezone = await ask("Your timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const brandColor = await ask("Brand colour (hex)", "#0f766e");
  return { businessName, ownerName, ownerEmail, timezone, brandColor };
}

/** Settings row + a default "Working hours" schedule (Mon–Fri 9–5). Safe to run twice. */
function starterSql(o) {
  const scheduleId = id("sch");
  const rules = [1, 2, 3, 4, 5]
    .map((d) => `INSERT INTO "ScheduleRule" (id, scheduleId, weekday, startMinute, endMinute) SELECT ${sql(id("r"))}, ${sql(scheduleId)}, ${d}, 540, 1020 WHERE EXISTS (SELECT 1 FROM "Schedule" WHERE id = ${sql(scheduleId)});`)
    .join("\n");
  return `-- Starter data written by scripts/setup.mjs
INSERT OR IGNORE INTO "Settings" (id, businessName, ownerName, ownerEmail, timezone, brandColor) VALUES (1, ${sql(o.businessName)}, ${sql(o.ownerName)}, ${sql(o.ownerEmail)}, ${sql(o.timezone)}, ${sql(o.brandColor)});
INSERT INTO "Schedule" (id, name, timezone, isDefault) SELECT ${sql(scheduleId)}, 'Working hours', ${sql(o.timezone)}, 1 WHERE NOT EXISTS (SELECT 1 FROM "Schedule");
${rules}
`;
}

function withTempFile(name, text, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "booking-setup-"));
  const file = path.join(dir, name);
  writeFileSync(file, text);
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- local

async function setupLocal() {
  say(bold("Local setup — runs the app on this computer"));
  if (!existsSync("node_modules") && !run("npm", ["install"])) fail("npm install failed");
  if (!existsSync(".env")) writeFileSync(".env", `# Only the local database path lives here. Local secrets: .env.development.local\nDATABASE_URL="file:./dev.db"\n`);

  const o = await askOwner();
  let adminPassword = null;
  if (existsSync(".env.development.local") && !force) {
    say("\n.env.development.local already exists — keeping your current secrets (use --force to replace them).");
  } else {
    adminPassword = password();
    writeFileSync(
      ".env.development.local",
      `# Local development secrets — never committed, never deployed (.env* is git-ignored)
APP_URL="http://localhost:3000"
ADMIN_PASSWORD="${adminPassword}"
SESSION_SECRET="${secret()}"
CRON_SECRET="${secret()}"
UPLOAD_DIR="./uploads"
# Encrypts stored Google / MailerLite keys (32 bytes, base64)
TOKEN_ENCRYPTION_KEY="${randomBytes(32).toString("base64")}"
# "outbox" records emails in the dashboard without sending; "gmail" sends through your connected Google account
EMAIL_DELIVERY="outbox"
# Google (optional): OAuth client id/secret from Google Cloud — see README
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
# Safe mode: every email goes to you instead of clients, and calendar invites invite nobody
SAFE_MODE_REDIRECT_TO="${o.ownerEmail}"
`,
    );
  }

  if (!(npx("prisma", "migrate", "deploy"))) fail("Creating the local database failed");
  if (!(npx("prisma", "generate"))) fail("prisma generate failed");
  if (!(withTempFile("starter.sql", starterSql(o), (f) => npx("prisma", "db", "execute", "--file", f)))) fail("Adding starter data failed");

  say(bold("\n✓ Ready."));
  say("  Start it:   npm run dev");
  say("  Booking page:  http://localhost:3000");
  say("  Dashboard:     http://localhost:3000/admin");
  if (adminPassword) {
    saveSecret("local-admin.txt", `${adminPassword}\n`);
    say(`  Dashboard password: ${bold(adminPassword)}  (also saved in secrets/local-admin.txt)`);
  }
  say("  Next: add a booking type in the dashboard (+ Create → Booking type).");
}

// ---------------------------------------------------------------- cloudflare

async function setupCloudflare() {
  say(bold("Cloudflare setup — puts your own copy online"));
  say("You need a Cloudflare account (the free plan works to start; Workers Paid is $5/month for more traffic).");
  if (existsSync("wrangler.jsonc") && !force) {
    fail("wrangler.jsonc already exists, so this copy is already set up. Run `npm run update` to deploy changes, or add --force to start over (this does not delete anything online).");
  }
  if (!capture("npx", ["wrangler", "whoami"]).out.match(/You are logged in|associated with the email/i)) {
    say("\nLogging in to Cloudflare (a browser window opens)…");
    if (!(npx("wrangler", "login"))) fail("Cloudflare login failed");
  }

  const o = await askOwner();
  say(bold("\nYour site"));
  const name = slug(await ask("Short name for your app (letters, numbers, dashes)", slug(o.businessName) + "-booking"));
  let appUrl;
  let routes = "";
  const domain = (await ask("Custom domain, e.g. book.example.com (leave empty to use a free workers.dev address)")).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain) {
    appUrl = `https://${domain}`;
    routes = `"routes": [{ "pattern": "${domain}", "custom_domain": true }],`;
    say(`  ${domain} must be a domain (or subdomain of a domain) that's on your Cloudflare account.`);
  } else {
    say("  Your workers.dev subdomain is shown in the Cloudflare dashboard → Workers & Pages (e.g. alex-123).");
    const sub = await ask("Your workers.dev subdomain");
    if (!sub) fail("A workers.dev subdomain or a custom domain is needed for the site address.");
    appUrl = `https://${name}.${sub.replace(/\.workers\.dev$/, "")}.workers.dev`;
  }

  say(bold("\nGoogle Calendar, Meet and Gmail (optional — you can add this later, see README)"));
  const googleClientId = await ask("Google OAuth client ID (leave empty to skip)");

  // Database
  say(bold("\nCreating your database…"));
  const findDb = () => {
    const r = capture("npx", ["wrangler", "d1", "list", "--json"]);
    try {
      return JSON.parse(r.out.slice(r.out.indexOf("["))).find((d) => d.name === name)?.uuid ?? null;
    } catch {
      return null;
    }
  };
  let databaseId = findDb();
  if (!databaseId) {
    if (!(npx("wrangler", "d1", "create", name))) fail("Creating the D1 database failed");
    databaseId = findDb();
  }
  if (!databaseId) fail("Couldn't find the new database's id. Run `npx wrangler d1 list` and try again.");

  // File storage (R2 must be enabled once in the Cloudflare dashboard → R2)
  say(bold("\nCreating private file storage for uploads…"));
  const r2 = capture("npx", ["wrangler", "r2", "bucket", "create", `${name}-uploads`]);
  if (!r2.ok && !/already exists/i.test(r2.out)) {
    say(r2.out);
    fail("Creating the R2 bucket failed. Open the Cloudflare dashboard → R2 once to enable it, then run this again with --force.");
  }

  // Config
  const config = readFileSync("wrangler.example.jsonc", "utf8")
    .replace(/^\/\/ Template.*\n\/\/ writes.*\n/m, "")
    .replaceAll("__WORKER_NAME__", name)
    .replaceAll("__DATABASE_ID__", databaseId)
    .replaceAll("__APP_URL__", appUrl)
    .replaceAll("__EMAIL_DELIVERY__", googleClientId ? "gmail" : "outbox")
    .replaceAll("__GOOGLE_CLIENT_ID__", googleClientId)
    .replace("__ROUTES__", routes);
  writeFileSync("wrangler.jsonc", config);
  say("\n✓ Wrote wrangler.jsonc (git-ignored — it's yours only).");

  // Tables + starter data
  if (!(npx("wrangler", "d1", "migrations", "apply", name, "--remote"))) fail("Creating the database tables failed");
  if (!(withTempFile("starter.sql", starterSql(o), (f) => npx("wrangler", "d1", "execute", name, "--remote", `--file=${f}`, "-y")))) fail("Adding starter data failed");

  // First deploy, then secrets (the worker has to exist first)
  if (!(run("npm", ["run", "cf:deploy"]))) fail("Deploy failed");
  const adminPassword = password();
  const secrets = {
    ADMIN_PASSWORD: adminPassword,
    SESSION_SECRET: secret(),
    CRON_SECRET: secret(),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
  if (!(withTempFile("secrets.json", JSON.stringify(secrets), (f) => npx("wrangler", "secret", "bulk", f)))) fail("Saving secrets failed");
  if (googleClientId) {
    say("\nPaste your Google OAuth client secret when asked (it isn't shown or saved anywhere else):");
    if (!(npx("wrangler", "secret", "put", "GOOGLE_CLIENT_SECRET"))) say("  Skipped — run `npx wrangler secret put GOOGLE_CLIENT_SECRET` later.");
  }
  saveSecret("production-admin.txt", `${adminPassword}\n`);

  say(bold("\n✓ Your booking site is live."));
  say(`  Booking page:  ${appUrl}`);
  say(`  Dashboard:     ${appUrl}/admin`);
  say(`  Dashboard password: ${bold(adminPassword)}  (also saved in secrets/production-admin.txt)`);
  if (domain) say("  A new custom domain can take a few minutes to start working.");
  say("  Next: sign in, check Settings, then add your first booking type (+ Create → Booking type).");
  if (googleClientId) say(`  Google: add ${appUrl}/api/google/callback as an authorised redirect URI, then connect on the "Google & email" page.`);
}

// ---------------------------------------------------------------- update

async function update() {
  if (!existsSync("wrangler.jsonc")) fail("No wrangler.jsonc yet — run `npm run setup -- cloudflare` first.");
  const db = readFileSync("wrangler.jsonc", "utf8").match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  if (!db) fail("Couldn't find database_name in wrangler.jsonc.");
  say(bold(`Updating ${db}: install packages, apply database changes, deploy`));
  if (!(run("npm", ["install"]))) fail("npm install failed");
  if (!(npx("wrangler", "d1", "migrations", "apply", db, "--remote"))) fail("Applying database changes failed");
  if (!(run("npm", ["run", "cf:deploy"]))) fail("Deploy failed");
  say(bold(`\n✓ Updated to version ${JSON.parse(readFileSync("package.json", "utf8")).version}.`));
}

try {
  if (mode === "local") await setupLocal();
  else if (mode === "cloudflare") await setupCloudflare();
  else if (mode === "update") await update();
  else {
    say("Usage:\n  npm run setup -- local\n  npm run setup -- cloudflare\n  npm run update");
    process.exitCode = 1;
  }
} finally {
  rl?.close();
}
