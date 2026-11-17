# Booking app

A booking app for one coach, consultant or practitioner. It takes the best parts of Calendly and
Cal.com and runs on your own Cloudflare account, so your clients' details stay with you.

Version **1.0.1** — see [CHANGELOG.md](CHANGELOG.md) for what's new.

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
- **Google Calendar and Meet**: each booking goes into your calendar with a Meet link.
- **Group events** (workshops, webinars) with registration and capacity.
- **Dashboard**: bookings, contacts, insights (charts), private one-time links, an email outbox,
  automations, and settings for branding and a light or dark sidebar.
- **MailerLite** (optional): adds people who book to a group, which starts your MailerLite
  sequences.

Not included: payments (Stripe), SMS and Zoom.

## What you need

- A Mac, Linux or Windows computer with [Node.js](https://nodejs.org) 20 or newer and
  [git](https://git-scm.com).
- To put it online: a [Cloudflare](https://cloudflare.com) account. The free plan works to start;
  Workers Paid ($5/month) gives more room. A custom domain on Cloudflare is optional.
- For calendar sync, Meet links and sending email: a Google account and a free Google Cloud project
  (steps below). Without it, emails are kept in the dashboard's outbox and not sent.

## 1. Get the code

```bash
git clone https://github.com/<you>/<your-copy>.git booking
cd booking
npm install
```

If you're copying someone else's repository on GitHub, click **Fork** first and clone your fork.
That way you have your own copy and can still pull their updates (see "Getting updates" below).

## 2. Try it on your computer

```bash
npm run setup -- local
npm run dev
```

The setup asks for your business name, name, email, timezone and brand colour. It then creates a
local database with a Monday–Friday 9–5 schedule and generates the secrets. Your dashboard password
is printed once and saved in `secrets/local-admin.txt`.

- Booking page: http://localhost:3000
- Dashboard: http://localhost:3000/admin
- Next: **+ Create → Booking type**.

Locally, every email goes to you instead of clients (safe mode), so you can test freely.

## 3. Put it online (Cloudflare)

```bash
npm run setup -- cloudflare
```

This does the whole setup:

1. Logs you in to Cloudflare (a browser window opens the first time).
2. Asks for your details, a short name for the app, and your custom domain or workers.dev address.
3. Creates your own database (D1) and private file storage (R2).
4. Writes `wrangler.jsonc`, your personal config. It's git-ignored, so updates never overwrite it.
5. Creates the tables and starter data.
6. Deploys the app and stores the secrets in Cloudflare.
7. Prints your dashboard password and saves it in `secrets/production-admin.txt`.

If creating file storage fails, open **Cloudflare dashboard → R2** once to turn it on, then run the
setup again with `--force`.

## 4. Connect Google (calendar, Meet, Gmail)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **APIs & Services → Library**: enable the **Google Calendar API** and the **Gmail API**.
3. **OAuth consent screen**:
   - With Google Workspace, choose **Internal**.
   - With a personal Gmail, choose **External**, add yourself as a test user, then **Publish** the
     app. Unpublished test apps sign you out every 7 days.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Add these
   authorised redirect URIs:
   - `http://localhost:3000/api/google/callback`
   - `https://<your-site>/api/google/callback`
5. Put the client ID and secret in the right place:
   - **On Cloudflare:** enter the client ID when the setup asks, or put it in `wrangler.jsonc` →
     `vars.GOOGLE_CLIENT_ID`. Then run `npx wrangler secret put GOOGLE_CLIENT_SECRET`, set
     `EMAIL_DELIVERY` to `"gmail"` and run `npm run update`.
   - **Locally:** fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.development.local`
     and set `EMAIL_DELIVERY="gmail"`.
6. In the dashboard, open **Google & email → Connect Google** and tick the calendars to check for
   clashes.

Google is asked for these permissions: read your calendar list and free/busy times, create and
update events, and send email.

## Make it yours

- **Photo:** replace `public/avatar.png` with a square photo or logo.
- **Names, email, timezone, brand colour, sidebar style:** dashboard → Settings.
- **Palette and fonts:** `src/app/globals.css` and `src/app/layout.tsx`.
- **Safe mode** sends every email to you and leaves clients off calendar invites, for testing on
  the live site. Add `"SAFE_MODE_REDIRECT_TO": "you@example.com"` to `vars` in `wrangler.jsonc` and
  run `npm run update`. Remove it to go live.

## Getting updates

New features and fixes arrive as new versions. Each one is listed in [CHANGELOG.md](CHANGELOG.md),
and the version number shows at the bottom of the dashboard sidebar.

**If you forked on GitHub:** open your fork and click **Sync fork → Update branch**. Then, on your
computer:

```bash
git pull
npm run update
```

**If you cloned without forking:**

```bash
git remote add upstream https://github.com/saadalexander/booking-app.git   # once
git pull upstream main
npm run update
```

`npm run update` installs any new packages, applies database changes and redeploys. Your data,
settings and `wrangler.jsonc` stay as they are. If you changed the same lines as an update, git asks
you which version to keep for those lines.

## For developers

| Command | What |
| --- | --- |
| `npm run dev` | Local app on port 3000 |
| `npm test` | Unit tests (slot engine, insights, emails) |
| `npm run typecheck` · `npm run lint` | Type-check · lint |
| `npm run cf:preview` | Build the Cloudflare version and run it locally on port 8787 |
| `npm run cf:deploy` | Deploy only (refuses to deploy if local secrets got into the build) |

**Database changes.** For each change, add both:

- `d1-migrations/00NN_name.sql`, using additive `ALTER TABLE … ADD COLUMN` or `CREATE TABLE`;
- the same SQL in `prisma/migrations/<timestamp>_name/migration.sql`.

Then update `prisma/schema.prisma`. `npm run update` applies new migrations to your live database.

**Releasing a version.** Bump `version` in `package.json`, add a section to `CHANGELOG.md`, commit,
then tag it with `git tag v1.2.0 && git push --tags`.

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
| `prisma/schema.prisma` | Data model |
| `scripts/setup.mjs` | Setup and update |


## Security notes

- Secrets live only in Cloudflare (`wrangler secret`) and in git-ignored files on your computer:
  `.env*`, `secrets/`, `wrangler.jsonc`. Never commit them.
- Google and MailerLite keys are stored encrypted with `TOKEN_ENCRYPTION_KEY`. Keep that value
  unchanged once it's set, or you'll need to reconnect Google.
- Uploaded files are private. Only the signed-in owner can open them.

## Licence

MIT: you can use, change, share and sell this, as long as you keep the [LICENSE](LICENSE) file.
It comes with no warranty.
