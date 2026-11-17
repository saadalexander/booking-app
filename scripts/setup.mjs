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
import { spawn, spawnSync } from "node:child_process";
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

/** Ask until `check` accepts the answer. `check` returns the cleaned value, or { error } to ask again. */
async function askValid(question, fallback, check) {
  for (;;) {
    const r = check(await ask(question, fallback));
    if (typeof r === "string") return r;
    say(`  ${r.error}`);
    if (piped) fail(r.error);
  }
}

const TIMEZONES = Intl.supportedValuesOf("timeZone");
/** "melbourne", "Melbourne", "australia/melbourne", "new york" → the IANA name, or a list to choose from. */
function resolveTimezone(input) {
  const q = input.trim().replace(/\s+/g, "_").toLowerCase();
  if (!q) return { error: "Please enter a timezone, e.g. Australia/Melbourne." };
  const exact = TIMEZONES.find((z) => z.toLowerCase() === q);
  if (exact) return exact;
  const byCity = TIMEZONES.filter((z) => z.toLowerCase().split("/").at(-1) === q);
  if (byCity.length === 1) return byCity[0];
  const partial = TIMEZONES.filter((z) => z.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  const options = (byCity.length ? byCity : partial).slice(0, 6);
  return { error: options.length ? `Which one? Type it exactly: ${options.join(", ")}` : `"${input.trim()}" isn't a timezone. Use Region/City, e.g. Australia/Melbourne or America/New_York.` };
}

function resolveColour(input) {
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : { error: "A brand colour looks like #4c050c (a # and six letters or numbers)." };
}

function resolveShortName(input) {
  const v = slug(input);
  if (/^[0-9a-f]{6}$/.test(v)) return { error: `"${input}" looks like a colour code, not a name. Try something like "book" or "alex-booking".` };
  if (v.length < 3) return { error: "Use at least 3 letters, e.g. book." };
  return v;
}

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
  say("Type each answer and press Enter. If you pasted several commands at once, press Ctrl+C and run them one at a time.");
  const businessName = await ask("Business name", "My Coaching");
  const ownerName = await ask("Your first name", "Alex");
  let ownerEmail = "";
  while (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    ownerEmail = await ask("Your email (booking notifications go here)");
    if (piped && !ownerEmail) fail("An email address is needed.");
  }
  const timezone = await askValid("Your timezone (press Enter to keep this one)", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", resolveTimezone);
  say(`  Timezone: ${timezone}`);
  const brandColor = await askValid("Brand colour, e.g. #4c050c (press Enter for the default)", "#0f766e", resolveColour);
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

/** .env only holds the local database path, which the database tool (Prisma) needs even for Cloudflare builds. */
function writeLocalEnv() {
  if (!existsSync(".env")) writeFileSync(".env", `# Only the local database path lives here. Local secrets: .env.development.local\nDATABASE_URL="file:./dev.db"\n`);
}

/** Run a command, showing its output as it comes, and also return it (to read the deployed address). */
function runTee(cmd, cmdArgs) {
  say(`\n$ ${[cmd, ...cmdArgs].join(" ")}`);
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(cmd, cmdArgs, { stdio: ["inherit", "pipe", "pipe"] });
    child.stdout.on("data", (d) => (process.stdout.write(d), (out += d)));
    child.stderr.on("data", (d) => (process.stderr.write(d), (out += d)));
    child.on("close", (code) => resolve({ ok: code === 0, out }));
  });
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
  writeLocalEnv();

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
# Google (optional): paste the OAuth client in the dashboard (Google & email), or set it here
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
  say("No Terminal? The README's \"Deploy to Cloudflare\" button does all of this in your browser instead.");
  const existing = existsSync("wrangler.jsonc") ? readFileSync("wrangler.jsonc", "utf8") : "";
  if (/"database_id"\s*:\s*"[0-9a-f-]{36}"/.test(existing) && !force) {
    fail("wrangler.jsonc already exists, so this copy is already set up. Run `npm run update` to deploy changes, or add --force to start over (this does not delete anything online, and reuses the database if you give the same short name).");
  }
  writeLocalEnv();
  if (!existsSync("node_modules") && !run("npm", ["install"])) fail("npm install failed");
  if (!capture("npx", ["wrangler", "whoami"]).out.match(/You are logged in|associated with the email/i)) {
    say("\nLogging in to Cloudflare (a browser window opens)…");
    if (!(npx("wrangler", "login"))) fail("Cloudflare login failed");
  }

  const o = await askOwner();
  say(bold("\nYour site"));
  const name = await askValid("Short name for your app, e.g. book (letters, numbers, dashes)", "book", resolveShortName);
  say(`  Short name: ${name}`);
  let routes = "";
  const domain = (await ask("Custom domain, e.g. book.example.com (press Enter to use a free workers.dev address)")).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain) {
    routes = `"routes": [{ "pattern": "${domain}", "custom_domain": true }],`;
    say(`  ${domain} must be a domain (or subdomain of a domain) that's on your Cloudflare account.`);
  }

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
  if (databaseId) say(`  Reusing your existing database "${name}".`);
  else {
    if (!(npx("wrangler", "d1", "create", name))) fail("Creating the D1 database failed");
    databaseId = findDb();
  }
  if (!databaseId) fail("Couldn't find the new database's id. Run `npx wrangler d1 list` and try again.");

  // File storage (R2 must be switched on once in the Cloudflare dashboard → R2)
  say(bold("\nCreating private file storage for uploads…"));
  const r2 = capture("npx", ["wrangler", "r2", "bucket", "create", `${name}-uploads`]);
  if (!r2.ok && !/already exists/i.test(r2.out)) {
    say(r2.out);
    fail("Creating file storage (R2) failed. Open dash.cloudflare.com → R2 Object Storage once and switch it on (the free tier is plenty), then run `npm run setup -- cloudflare --force` and give the same answers.");
  }

  // Config
  const config = readFileSync("wrangler.example.jsonc", "utf8")
    .replace(/^\/\/ Template.*\n\/\/ writes.*\n/m, "")
    .replaceAll("__WORKER_NAME__", name)
    .replaceAll("__DATABASE_ID__", databaseId)
    .replace("__APP_URL__", domain ? `"APP_URL": "https://${domain}",\n    ` : "")
    .replace("__ROUTES__", routes);
  writeFileSync("wrangler.jsonc", config);
  say("\n✓ Wrote wrangler.jsonc (your site's settings).");

  // Tables + starter data
  if (!(npx("wrangler", "d1", "migrations", "apply", name, "--remote"))) fail("Creating the database tables failed");
  if (!(withTempFile("starter.sql", starterSql(o), (f) => npx("wrangler", "d1", "execute", name, "--remote", `--file=${f}`, "-y")))) fail("Adding starter data failed");

  // Save the password before anything that can fail, so it's never lost.
  const adminPassword = password();
  saveSecret("production-admin.txt", `${adminPassword}\n`);

  // Deploy, then secrets (the worker has to exist first).
  const deploy = await runTee("npm", ["run", "cf:deploy"]);
  const liveUrl = domain ? `https://${domain}` : deploy.out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0] ?? null;
  if (!deploy.ok) {
    say(bold("\n! The deploy reported a problem (see the lines above)."));
    say(liveUrl ? `  Your site was uploaded (${liveUrl}), so setup carries on.` : "  Setup carries on with the passwords, then tells you what to do next.");
  }
  const secrets = {
    ADMIN_PASSWORD: adminPassword,
    SESSION_SECRET: secret(),
    CRON_SECRET: secret(),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
  if (!(withTempFile("secrets.json", JSON.stringify(secrets), (f) => npx("wrangler", "secret", "bulk", f)))) {
    fail("Saving the passwords in Cloudflare failed. Run `npm run setup -- cloudflare --force` again with the same answers: it reuses everything already made.");
  }
  if (!deploy.ok && !liveUrl) fail("The site didn't deploy. Run `npm run update` to try the deploy again; your database and passwords are already set up.");

  say(bold("\n✓ Your booking site is live."));
  if (liveUrl) {
    say(`  Booking page:  ${liveUrl}`);
    say(`  Dashboard:     ${liveUrl}/admin`);
  } else say("  Your address is shown in the Cloudflare dashboard → Workers & Pages.");
  say(`  Dashboard password: ${bold(adminPassword)}  (also saved in secrets/production-admin.txt)`);
  if (domain) say("  A new custom domain can take a few minutes to start working.");
  say("  Next: sign in, then follow \"Getting started\" in the dashboard (connect Google, add a booking type).");
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
