# Changelog

Each version lists what changed. Version numbers follow the pattern **major.minor.fix**:

- **fix** (1.0.1): bug fixes only;
- **minor** (1.1.0): new features that don't need anything from you;
- **major** (2.0.0): something you need to do when updating, which the notes spell out.

To update your copy, see "Getting updates" in the [README](README.md).

## 1.0.1 — 13 November 2026

- Fixed: putting a copy online (`npm run setup -- cloudflare` / `npm run update`) failed while
  building, because page titles tried to read the business name before the database was available.

## 1.0.0 — 13 November 2026

The first shareable release.

### New: share and set up your own copy
- `npm run setup -- local` runs your own copy on your computer in a few minutes.
- `npm run setup -- cloudflare` puts your own copy online. It creates your database, file storage
  and secrets, then deploys.
- `npm run update` gets a new version live: it installs packages, applies database changes and
  redeploys.
- Step-by-step setup guide in the README, including connecting Google.
- The version number shows at the bottom of the dashboard sidebar.
- Page titles use your business name from Settings. Your photo is `public/avatar.png`.

### Booking pages
- Opens on the first free day, detects the client's timezone, and has a grouped, searchable
  timezone picker with 12-hour or 24-hour times.
- Times appear in a panel to the right of the calendar. Switching timezone is instant.
- Pages load faster. Available times start loading as soon as the page opens, and calendar checks
  are shared across Cloudflare's servers: about 0.3 s instead of 1.5–2 s.
- Category sections, upcoming group events, and your photo on the main page.

### Booking types
- New settings editor with a left-hand menu (Basics, Availability, Booking form, Emails & invites,
  Limits & buffers, How far ahead, Reschedule & cancel, MailerLite). Each setting has a toggle and
  one plain sentence saying what it does.
- **Optimized slots**: offers a time right when an earlier booking ends (9:20, not 9:30).
- Minimum notice in minutes, hours or days. Optional limits switch on with a toggle: start-time
  gap, bookings per day, group seats, how far ahead.
- Custom hours per booking type.
- Categories with drag-and-drop and "Move to category…".
- A compact, full-width list with a menu for each booking type: duplicate, hide, copy link, private
  link, embed code, troubleshoot.
- "Copy link" next to "Open booking page".
- Troubleshooter: shows why each of the next 14 days has or hasn't got times.

### Availability
- Times are picked from a dropdown in 15-minute steps instead of typed.
- Date overrides, buffers, booking windows and daily limits.
- All-day calendar events block the right day in your timezone (fixed: they used to spill into the
  next morning).

### Automations and email
- Email automations: on booking, reschedule or cancel, or a set time before or after the call.
  Includes templates, a live preview and "send me a test".
- The built-in 24-hour and 1-hour reminders can be switched off when you use your own.
- Confirmations, reschedules and cancellations go out through Gmail with calendar invites. Health
  details are kept out of subject lines.

### Group events
- Free events with their own page, registration, capacity, a calendar file, reminders and
  self-cancel. Events block 1:1 times.

### Dashboard
- Sidebar with icons, a "+ Create" menu and a light or dark style.
- Insights: meetings, hours, cancellations, new and returning contacts, busiest days and times,
  and top booking types. Ranges up to all time.
- Contacts, email outbox, private one-time links, and email and phone on each booking.

### Integrations
- Google Calendar (clash checking, events with Meet links) and Gmail.
- MailerLite: adds people who book a type to a group, with call details in custom fields; removes
  them when they cancel.

