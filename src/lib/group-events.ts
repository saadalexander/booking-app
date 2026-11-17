/**
 * Group events: one-off sessions on a set date (workshops, webinars, Q&As) that people register for.
 * Unlike booking types there is no "availability" to set up — the event simply has a date, a time
 * and (optionally) a number of seats.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { createEvent, deleteEvent, getConnection, patchEvent } from "./google";
import { appUrl, getSettings } from "./settings";

export class EventError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const EVENT_LOCATIONS: Record<string, string> = {
  google_meet: "Google Meet (link sent when you register)",
  online_link: "Online",
  in_person: "In person",
};

type Ev = {
  id: string;
  slug: string;
  title: string;
  description: string;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
  locationType: string;
  locationDetail: string | null;
  meetUrl: string | null;
  status: string;
  capacity: number | null;
  googleEventId: string | null;
};

export function eventUrl(ev: { slug: string }) {
  return `${appUrl()}/e/${ev.slug}`;
}

export function whenText(ev: { startUtc: Date; endUtc: Date }, tz: string) {
  const s = DateTime.fromJSDate(ev.startUtc, { zone: tz });
  const e = DateTime.fromJSDate(ev.endUtc, { zone: tz });
  return `${s.toFormat("cccc d LLLL yyyy, h:mm a")} – ${e.toFormat("h:mm a")} (${tz.replace(/_/g, " ")})`;
}

/** Where, for people who have registered (includes the joining link). */
export function whereText(ev: Ev) {
  if (ev.locationType === "google_meet") return ev.meetUrl ? `Google Meet: ${ev.meetUrl}` : "Google Meet — the link will be emailed before the event";
  if (ev.locationType === "online_link") return ev.locationDetail ? `Online: ${ev.locationDetail}` : "Online";
  return ev.locationDetail ? `In person: ${ev.locationDetail}` : "In person";
}

/** "Add to Google Calendar" link. */
export function googleCalendarLink(ev: Ev) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${fmt(ev.startUtc)}/${fmt(ev.endUtc)}`,
    details: `${whereText(ev)}\n\n${eventUrl(ev)}`,
    location: ev.locationType === "in_person" ? ev.locationDetail ?? "" : ev.meetUrl ?? ev.locationDetail ?? "",
  });
  return `https://calendar.google.com/calendar/render?${qs}`;
}

/** An .ics file (Apple Calendar, Outlook). */
export function icsFile(ev: Ev, s: { businessName: string }) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${esc(s.businessName)}//Events//EN`,
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@${new URL(appUrl()).host}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.startUtc)}`,
    `DTEND:${fmt(ev.endUtc)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(`${whereText(ev)}\n\n${eventUrl(ev)}`)}`,
    `LOCATION:${esc(ev.locationType === "in_person" ? ev.locationDetail ?? "" : ev.meetUrl ?? ev.locationDetail ?? "Online")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export async function seatsTaken(eventId: string) {
  return prisma.eventRegistration.count({ where: { eventId, status: "registered" } });
}

// ---------- Google Calendar ----------

/** Puts the event in your Google Calendar (with a Meet link if chosen) or updates it. Never throws. */
export async function syncEventToGoogle(eventId: string) {
  const ev = await prisma.groupEvent.findUnique({ where: { id: eventId } });
  if (!ev || !(await getConnection())) return;
  try {
    const description = [`Group event — registrations: ${appUrl()}/admin/events/${ev.id}`, `Public page: ${eventUrl(ev)}`].join("\n");
    const location = ev.locationType === "in_person" ? ev.locationDetail ?? "" : ev.locationType === "online_link" ? ev.locationDetail ?? "" : undefined;
    if (ev.status === "cancelled") {
      if (ev.googleEventId) await deleteEvent(ev.googleEventId);
      await prisma.groupEvent.update({ where: { id: ev.id }, data: { googleEventId: null, googleSyncError: null } });
      return;
    }
    if (ev.googleEventId) {
      await patchEvent(ev.googleEventId, { summary: `${ev.title} (group event)`, description, location, start: ev.startUtc, end: ev.endUtc, timezone: ev.timezone });
      await prisma.groupEvent.update({ where: { id: ev.id }, data: { googleSyncError: null } });
      return;
    }
    const { eventId: gid, meetUrl } = await createEvent({
      groupEventId: ev.id,
      summary: `${ev.title} (group event)`,
      description,
      start: ev.startUtc,
      end: ev.endUtc,
      timezone: ev.timezone,
      attendees: [], // registrants get their own emails; nobody sees the guest list
      location,
      withMeet: ev.locationType === "google_meet",
    });
    await prisma.groupEvent.update({ where: { id: ev.id }, data: { googleEventId: gid, meetUrl: meetUrl ?? ev.meetUrl, googleSyncError: null } });
  } catch (e) {
    console.error("group event calendar sync failed", e);
    await prisma.groupEvent.update({ where: { id: eventId }, data: { googleSyncError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
  }
}

// ---------- registration ----------

export const registrationSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(200),
  phone: z.string().trim().max(40).optional().default(""),
  timezone: z.string().max(80).optional().default(""),
});

function token() {
  return randomBytes(18).toString("base64url");
}

async function sendRegistrationEmails(regId: string, again = false) {
  const r = await prisma.eventRegistration.findUnique({ where: { id: regId }, include: { event: true } });
  if (!r) return;
  const s = await getSettings();
  const ev = r.event;
  const first = r.name.trim().split(/\s+/)[0] || r.name;
  await sendEmail(
    r.email,
    `${again ? "You're still registered" : "You're registered"}: ${ev.title} — ${DateTime.fromJSDate(ev.startUtc, { zone: r.timezone }).toFormat("d LLL, h:mm a")}`,
    [
      `Hi ${first},`,
      ``,
      `You're registered for ${ev.title}.`,
      ``,
      `When: ${whenText(ev, r.timezone)}`,
      `Where: ${whereText(ev)}`,
      ``,
      `Add it to your calendar:`,
      `Google: ${googleCalendarLink(ev)}`,
      `Apple / Outlook: ${eventUrl(ev)}/calendar.ics`,
      ``,
      `Can't make it? Let us know so someone else can have your seat: ${appUrl()}/e/r/${r.manageToken}`,
      ``,
      `See you there,`,
      s.ownerName,
    ].join("\n"),
    "event_registered",
  );
  if (!again) {
    const taken = await seatsTaken(ev.id);
    await sendEmail(
      s.ownerEmail,
      `New registration: ${ev.title} — ${r.name}`,
      [`${r.name} <${r.email}>${r.phone ? `, ${r.phone}` : ""}`, `${taken}${ev.capacity ? ` of ${ev.capacity}` : ""} registered.`, ``, `${appUrl()}/admin/events/${ev.id}`].join("\n"),
      "owner_event_registration",
    );
  }
}

/** Registers someone for an event. Registering again with the same email just resends their details. */
export async function register(slug: string, input: z.infer<typeof registrationSchema>) {
  const ev = await prisma.groupEvent.findUnique({ where: { slug } });
  if (!ev || ev.status === "draft") throw new EventError("This event doesn't exist", 404);
  if (ev.status === "cancelled") throw new EventError("This event has been cancelled", 410);
  if (ev.startUtc <= new Date()) throw new EventError("Registration for this event has closed", 410);
  const tz = DateTime.local().setZone(input.timezone).isValid && input.timezone ? input.timezone : ev.timezone;

  const existing = await prisma.eventRegistration.findUnique({ where: { eventId_email: { eventId: ev.id, email: input.email } } });
  if (existing?.status === "registered") {
    await sendRegistrationEmails(existing.id, true);
    return { registration: existing, already: true };
  }
  if (ev.capacity != null && (await seatsTaken(ev.id)) >= ev.capacity) throw new EventError("Sorry, this event is full", 409);

  const client = await prisma.client.upsert({
    where: { email: input.email },
    update: { ...(input.phone ? { phone: input.phone } : {}) },
    create: { email: input.email, name: input.name, phone: input.phone || null },
  });
  const data = { name: input.name, phone: input.phone || null, timezone: tz, status: "registered", clientId: client.id, manageToken: token(), reminderSentAt: null, createdAt: new Date() };
  const reg = existing
    ? await prisma.eventRegistration.update({ where: { id: existing.id }, data })
    : await prisma.eventRegistration.create({ data: { ...data, eventId: ev.id, email: input.email } });

  // Two people taking the last seat at the same moment: the later registration gives it back.
  if (ev.capacity != null) {
    const order = await prisma.eventRegistration.findMany({ where: { eventId: ev.id, status: "registered" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    if (order.findIndex((x) => x.id === reg.id) >= ev.capacity) {
      await prisma.eventRegistration.update({ where: { id: reg.id }, data: { status: "cancelled" } });
      throw new EventError("Sorry, this event just filled up", 409);
    }
  }
  await sendRegistrationEmails(reg.id);
  return { registration: reg, already: false };
}

export async function cancelRegistration(manageToken: string) {
  const r = await prisma.eventRegistration.findUnique({ where: { manageToken }, include: { event: true } });
  if (!r) throw new EventError("Registration not found", 404);
  if (r.status === "cancelled") return r;
  const updated = await prisma.eventRegistration.update({ where: { id: r.id }, data: { status: "cancelled" }, include: { event: true } });
  const s = await getSettings();
  await sendEmail(r.email, `Cancelled: ${r.event.title}`, [`Hi ${r.name.split(/\s+/)[0]},`, ``, `Your place at ${r.event.title} has been cancelled. Thanks for letting us know.`, ``, s.ownerName].join("\n"), "event_cancelled_by_client");
  await sendEmail(s.ownerEmail, `Cancelled registration: ${r.event.title} — ${r.name}`, `${r.name} <${r.email}> can no longer come.\n\n${appUrl()}/admin/events/${r.event.id}`, "owner_event_cancellation");
  return updated;
}

/** You cancel the whole event: everyone registered is told. */
export async function cancelWholeEvent(eventId: string, reason: string | null) {
  const ev = await prisma.groupEvent.update({ where: { id: eventId }, data: { status: "cancelled" } });
  const regs = await prisma.eventRegistration.findMany({ where: { eventId, status: "registered" } });
  const s = await getSettings();
  for (const r of regs) {
    await sendEmail(
      r.email,
      `Cancelled: ${ev.title} — ${DateTime.fromJSDate(ev.startUtc, { zone: r.timezone }).toFormat("d LLL")}`,
      [`Hi ${r.name.split(/\s+/)[0]},`, ``, `Unfortunately ${ev.title} on ${whenText(ev, r.timezone)} has been cancelled.`, reason ? `\n${reason}` : ``, ``, `Sorry for the change of plans,`, s.ownerName].join("\n"),
      "event_cancelled_by_owner",
    );
  }
  await syncEventToGoogle(eventId);
  return regs.length;
}

/** 24-hour reminders for registrations (run by the cron every 10 minutes). */
export async function runEventReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const regs = await prisma.eventRegistration.findMany({
    where: { status: "registered", reminderSentAt: null, event: { status: "published", startUtc: { gt: now, lte: soon } } },
    include: { event: true },
  });
  let sent = 0;
  for (const r of regs) {
    // Registered less than 2 h before the reminder moment: they've just had the details.
    if (r.createdAt.getTime() > r.event.startUtc.getTime() - 26 * 3_600_000) {
      await prisma.eventRegistration.update({ where: { id: r.id }, data: { reminderSentAt: now } });
      continue;
    }
    const claimed = await prisma.eventRegistration.updateMany({ where: { id: r.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const s = await getSettings();
    await sendEmail(
      r.email,
      `Tomorrow: ${r.event.title} at ${DateTime.fromJSDate(r.event.startUtc, { zone: r.timezone }).toFormat("h:mm a")}`,
      [`Hi ${r.name.split(/\s+/)[0]},`, ``, `A reminder that ${r.event.title} is on ${whenText(r.event, r.timezone)}.`, ``, `Where: ${whereText(r.event)}`, ``, `Can't make it? ${appUrl()}/e/r/${r.manageToken}`, ``, s.ownerName].join("\n"),
      "event_reminder",
    );
    sent++;
  }
  return { sent };
}
