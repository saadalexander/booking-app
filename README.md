# Booking app

A booking app for one coach, consultant or practitioner. It takes the best parts of Calendly and
Cal.com and runs on your own Cloudflare account, so your clients' details stay with you.

Version **1.1.0**. See [CHANGELOG.md](CHANGELOG.md) for what's new.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/saadalexander/booking-app)

## What it does

- **Booking pages** with booking types grouped into categories. Each page opens on the first free
  day, detects the client's timezone, and offers a searchable timezone picker.
- **Availability**: weekly hours, date overrides, buffers, minimum notice, how far ahead people can
  book, per-day limits, group seats and optimized start times. It checks your Google Calendar for
  clashes.
- **Booking form**: your own questions, file uploads, checklists and consent boxes.
- **Clients can reschedule or cancel** through a private link, within the window you set.
- **Emails** for confirmations, reminders and automations (reminders, thank-yous, follow-ups),
  sent through your Gmail. Health details are kept out of email subjects.
- **Google Calendar and Meet**: each booking goes into your calendar with a Meet link. Or use your
  own **Zoom** meeting link, a phone call, or an address for in-person sessions.
- **Group events** (workshops, webinars) with registration and capacity.
- **Dashboard**: bookings, contacts, insights (charts), private one-time links, an email outbox,
  automations, and settings for branding and a light or dark sidebar.
- **MailerLite** (optional): adds people who book to a group, which starts your MailerLite
  sequences.

Not included: payments (Stripe), SMS, and a new Zoom meeting per booking (your own Zoom link is
used for every session).

## Set it up without Terminal (about 20 minutes)

Everything happens in your web browser. You need:

- a free [Cloudflare](https://dash.cloudflare.com/sign-up) account;
- a free [GitHub](https://github.com/signup) account (Cloudflare keeps your copy of the app there);
- the Google account that has your calendar.

### 1. Switch on file storage in Cloudflare (once)

Clients can upload files on your booking form, and these are kept in Cloudflare's private file
storage, called R2. In the [Cloudflare dashboard](https://dash.cloudflare.com), click
**R2 Object Storage** in the left menu and follow the steps to switch it on. Cloudflare may ask for a
card. The free tier (10 GB) is far more than a booking app uses, so you shouldn't be charged.

### 2. Click "Deploy to Cloudflare"

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/saadalexander/booking-app)

Cloudflare walks you through it:

1. **Connect GitHub** if it asks, so Cloudflare can make your own copy of the app.
2. **Project name**: a short name such as `book`. It becomes part of your free web address,
   `https://book.<your-name>.workers.dev`.
3. **Database and storage**: Cloudflare shows the database and file storage it will create for you.
   Keep the suggested names.
4. **ADMIN_PASSWORD**: type the password you want for your dashboard. Save it in your password
   manager.
5. Click **Create and deploy**. Building takes about 5 minutes.

When it's done, Cloudflare shows your site's address.

### 3. Sign in and fill in the welcome screen

Open your site's address with **/admin** at the end, for example
`https://book.your-name.workers.dev/admin`, and sign in with the password from step 2.

The welcome screen asks for your business name, first name, email, timezone (picked from a list)
and brand colour (picked with a colour box). The dashboard then shows a **Getting started** list.

### 4. Connect Google (about 15 minutes)

Open **Google & email** in the dashboard. It walks you through creating your free Google "app" in
Google Cloud, shows the two addresses to copy into Google with a Copy button each, and has two
boxes for the keys Google gives you. Then click **Connect Google**.

Until Google is connected, emails wait in the dashboard's **Email outbox** and aren't sent.

### 5. Add your booking types

Use **+ Create → Booking type**, then share your booking page's address.

**Your own domain (optional):** in Cloudflare, open **Workers & Pages** → your app → **Settings** →
**Domains & Routes** → **Add** → **Custom domain**, and enter something like
`book.yourdomain.com`. The domain must already be on your Cloudflare account. Afterwards, open
**Google & email** in your dashboard on the new address and add the redirect address it shows to
Google Cloud too.

### Using an AI assistant to help?

Assistants such as Claude can do most of the Google Cloud clicking with you, and can read this
guide. Good to know:

- Some assistants run in an online workspace that can't reach Cloudflare. The steps above don't
  need one, because everything happens in your browser.
- You'll still type the passwords and click the agreement boxes yourself: assistants aren't allowed
  to accept terms or enter passwords for you.
- Never paste your dashboard password or Google Client secret into a chat you might share.

## Getting updates

New features and fixes arrive as new versions. Each one is listed in [CHANGELOG.md](CHANGELOG.md),
and your version number shows at the bottom of the dashboard sidebar.

**If you used the Deploy to Cloudflare button:**

1. On GitHub, open your copy of the app (Cloudflare made it under your account).
2. Click **Actions** → **Get the latest version** → **Run workflow**. If GitHub asks, first click
   the button that turns Actions on.
3. Cloudflare notices the change and redeploys your site in about 5 minutes, including any database
   changes. Your bookings, clients and settings stay as they are.

**If you set it up with Terminal:**

```bash
git pull
npm run update
```

`npm run update` installs any new packages, applies database changes and redeploys.

## Set it up with Terminal instead

This route suits developers, or anyone who wants to try the app on their own computer first. You
need [Node.js](https://nodejs.org) 20 or newer and [git](https://git-scm.com).

```bash
git clone https://github.com/saadalexander/booking-app.git booking
cd booking
npm install
```

To work on your own version and still get updates, click **Fork** on GitHub first and clone your
fork instead.

**Try it on your computer:**

```bash
npm run setup -- local
npm run dev
```

The setup asks a few questions and creates a local database with a Monday–Friday 9–5 schedule.
Your dashboard password is printed once and saved in `secrets/local-admin.txt`. Open
http://localhost:3000/admin. Locally, every email goes to you instead of clients (safe mode).

**Put it online:**

```bash
npm run setup -- cloudflare
```

It logs you in to Cloudflare (a browser window opens), asks a few questions, creates your database
and file storage, deploys, and prints your dashboard password (also saved in
`secrets/production-admin.txt`). Run each command on its own, and answer one question at a time.
If something goes wrong part way, run it again with `--force` and the same answers: it reuses what
it already made.

## Make it yours

- **Photo:** replace `public/avatar.png` with a square photo or logo. (With the Deploy button: on
  GitHub, open `public/avatar.png` in your copy, click the pencil or "Upload files", and Cloudflare
  redeploys.)
- **Names, email, timezone, brand colour, sidebar style:** dashboard → Settings.
- **Palette and fonts:** `src/app/globals.css` and `src/app/layout.tsx`.
- **Safe mode** sends every email to you and leaves clients off calendar invites, for testing on
  the live site. In Cloudflare → your app → **Settings** → **Variables and Secrets**, add a text
  variable `SAFE_MODE_REDIRECT_TO` with your email. Delete it to go live.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| The Cloudflare build fails with "Couldn't create file storage (R2)" | Switch on R2 (step 1), then click **Retry build** in Cloudflare. |
| "No dashboard password has been set" | Cloudflare → your app → **Settings** → **Variables and Secrets** → **Add**, type **Secret**, name `ADMIN_PASSWORD`. |
| Forgot the dashboard password | Same place: edit `ADMIN_PASSWORD` and save. |
| Google says `redirect_uri_mismatch` | Add the redirect address shown on **Google & email** to your client in Google Cloud. A custom domain needs its own line. |
| Google signs you out every 7 days | In Google Cloud → **Google Auth Platform** → **Audience**, click **Publish app**. |
| Emails stay in the Email outbox | Connect Google on **Google & email**. |
| No times show on a booking page | Check **Availability**: the schedule needs hours, and its timezone must be right. The booking type's **Troubleshoot** menu explains each day. |
| "Get the latest version" fails on a file in `.github/workflows` | Update that file on GitHub by hand (copy it from the original repository), then run the action again. |

## For developers

| Command | What |
| --- | --- |
| `npm run dev` | Local app on port 3000 |
| `npm test` | Unit tests (slot engine, insights, emails) |
| `npm run typecheck` · `npm run lint` | Type-check · lint |
| `npm run cf:preview` | Build the Cloudflare version and run it locally on port 8787 |
| `npm run cf:deploy` | Deploy only (refuses to deploy if local secrets got into the build) |
| `npm run deploy` | What Cloudflare runs for Deploy-button copies: database and storage, build, migrations, deploy |

**Database changes.** For each change, add both:

- `d1-migrations/00NN_name.sql`, using additive `ALTER TABLE … ADD COLUMN` or `CREATE TABLE`;
- the same SQL in `prisma/migrations/<timestamp>_name/migration.sql`.

Then update `prisma/schema.prisma`. `npm run update` and `npm run deploy` apply new migrations to
the live database.

**Releasing a version.** Bump `version` in `package.json`, add a section to `CHANGELOG.md`, commit,
then tag it with `git tag v1.2.0 && git push --tags`.

**One-click copies.** `wrangler.jsonc` here is the Deploy-button config: no database ID, no
secrets. `worker.ts` fills in what isn't set in Cloudflare: it generates `SESSION_SECRET`,
`CRON_SECRET` and `TOKEN_ENCRYPTION_KEY` once (kept in the `AppSecret` table), uses the address
the site is opened on as `APP_URL` (saved in `Settings.siteUrl` for the cron), and sends email
through Gmail once Google is connected. Values set in Cloudflare always win.
`npm run setup -- cloudflare` writes its own `wrangler.jsonc` from `wrangler.example.jsonc`.

### Code map

| Path | What |
| --- | --- |
| `src/lib/slots.ts` | Slot engine (pure functions, unit-tested) |
| `src/lib/availability.ts` | Loads schedules, bookings and calendar busy times, then calls the engine |
| `src/lib/bookings.ts` | Create, reschedule and cancel; validation; uploads; reminders |
| `src/lib/workflows.ts` | Automations |
| `src/lib/group-events.ts` | Group events and registrations |
| `src/lib/email.ts` | Email templates, outbox, Gmail delivery |
| `src/lib/google.ts` | Google sign-in, calendars, free/busy, events, Gmail |
| `src/lib/mailerlite.ts` | MailerLite sync |
| `src/components/Booker.tsx` | Public calendar and booking form |
| `src/app/admin/(dash)/` | Dashboard |
| `src/app/admin/welcome/` | First sign-in on a new copy |
| `worker.ts` | Cloudflare entry: defaults for one-click copies, and the 10-minute cron |
| `prisma/schema.prisma` | Data model |
| `scripts/setup.mjs` | Terminal setup and update |
| `scripts/ci-deploy.mjs` | Deploy-button builds |

## Security notes

- Your dashboard password is a Cloudflare secret (`ADMIN_PASSWORD`). Nothing else needs typing.
- On one-click copies, the app's other secrets are generated on first use and kept in your own
  database, as are the Google keys you paste in the dashboard. Copies set up with Terminal keep them
  as Cloudflare secrets instead (`wrangler secret`).
- Never commit `.env*`, `.dev.vars` or `secrets/`. They're git-ignored.
- Google and MailerLite tokens are stored encrypted.
- Uploaded files are private. Only the signed-in owner can open them.

## Licence

MIT: you can use, change, share and sell this, as long as you keep the [LICENSE](LICENSE) file.
It comes with no warranty.
