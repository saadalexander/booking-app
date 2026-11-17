/**
 * Email — phase 1 records every message in the EmailLog "outbox" (viewable at /admin/outbox)
 * and prints it to the server console. Phase 2 swaps `deliver` for a real provider (Resend).
 *
 * Privacy rule: client-facing emails never contain intake answers or health details, and use a
 * neutral title ("Appointment with Alex") rather than the event type name.
 */
import { DateTime } from "luxon";
import { prisma } from "./db";
import { getConnection, safeModeRecipient, sendGmail } from "./google";
import { appUrl, changeWindowHours, getSettings, LOCATION_LABELS } from "./settings";

type Settings = Awaited<ReturnType<typeof getSettings>>;

async function deliver(to: string, subject: string, body: string, kind: string, bookingId?: string) {
  const safe = safeModeRecipient();
  const actualTo = safe ?? to;
  const log = await prisma.emailLog.create({ data: { to, subject, body, kind, bookingId, sentTo: safe ? actualTo : null } });
  if ((process.env.EMAIL_DELIVERY ?? "outbox") !== "gmail" || !(await getConnection())) {
    console.log(`[email:${kind}] logged to outbox (not sent) to=${to}`);
    return;
  }
  try {
    const s = await getSettings();
    await sendGmail({ to: actualTo, subject: safe ? `[TEST → ${to}] ${subject}` : subject, body, fromName: `${s.ownerName} — ${s.businessName}` });
    await prisma.emailLog.update({ where: { id: log.id }, data: { status: "sent" } });
  } catch (e) {
    console.error(`[email:${kind}] send failed`, e);
    await prisma.emailLog.update({ where: { id: log.id }, data: { status: "failed", error: e instanceof Error ? e.message.slice(0, 500) : String(e) } });
  }
}

export interface BookingForEmail {
  id: string;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
  manageToken: string;
  phone: string | null;
  meetUrl?: string | null;
  client: { name: string; email: string };
  eventType: { title: string; neutralTitle: string | null; durationMinutes: number; locationType: string; cancelWindowHours: number | null; minNoticeMinutes: number };
}

function neutralTitle(b: BookingForEmail, s: Settings) {
  return b.eventType.neutralTitle?.trim() || `Appointment with ${s.ownerName}`;
}

function when(b: BookingForEmail, tz = b.timezone) {
  const d = DateTime.fromJSDate(b.startUtc, { zone: tz });
  return `${d.toFormat("cccc d LLLL yyyy, h:mm a")} (${tz.replace(/_/g, " ")})`;
}

function where(b: BookingForEmail) {
  if (b.eventType.locationType === "phone") return `Phone call — ${"we'll call you on " + (b.phone ?? "the number you provided")}`;
  const label = LOCATION_LABELS[b.eventType.locationType] ?? "Online";
  return b.meetUrl ? `${label}: ${b.meetUrl}` : `${label} — the joining link will be in your calendar invite`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function manageLink(b: BookingForEmail) {
  return `${appUrl()}/booking/${b.manageToken}`;
}

function policyLine(b: BookingForEmail, s: Settings) {
  const h = changeWindowHours(b.eventType, s.defaultCancelWindowHours);
  return h > 0 ? `You can reschedule or cancel up to ${h} hours before the appointment.` : "You can reschedule or cancel at any time before the appointment.";
}

export async function sendBookingConfirmation(b: BookingForEmail, isReschedule = false) {
  const s = await getSettings();
  const title = neutralTitle(b, s);
  await deliver(
    b.client.email,
    `${isReschedule ? "Rescheduled" : "Confirmed"}: ${title} — ${DateTime.fromJSDate(b.startUtc, { zone: b.timezone }).toFormat("d LLL, h:mm a")}`,
    [
      `Hi ${firstName(b.client.name)},`,
      ``,
      isReschedule ? `Your appointment with ${s.businessName} has been moved.` : `Your appointment with ${s.businessName} is confirmed.`,
      ``,
      `When: ${when(b)}`,
      `Length: ${b.eventType.durationMinutes} minutes`,
      `Where: ${where(b)}`,
      ``,
      `Reschedule or cancel: ${manageLink(b)}`,
      policyLine(b, s),
      ``,
      `See you soon,`,
      s.ownerName,
    ].join("\n"),
    isReschedule ? "client_rescheduled" : "client_confirmation",
    b.id,
  );
  await deliver(
    s.ownerEmail,
    `${isReschedule ? "Rescheduled" : "New booking"}: ${b.eventType.title} — ${b.client.name}`,
    [`${b.client.name} <${b.client.email}>`, `When: ${when(b, s.timezone)}`, ``, `Details: ${appUrl()}/admin/bookings/${b.id}`].join("\n"),
    isReschedule ? "owner_rescheduled" : "owner_new_booking",
    b.id,
  );
}

export async function sendCancellation(b: BookingForEmail, by: "client" | "owner", reason?: string | null) {
  const s = await getSettings();
  const title = neutralTitle(b, s);
  await deliver(
    b.client.email,
    `Cancelled: ${title} — ${DateTime.fromJSDate(b.startUtc, { zone: b.timezone }).toFormat("d LLL, h:mm a")}`,
    [
      `Hi ${firstName(b.client.name)},`,
      ``,
      by === "client" ? `Your appointment on ${when(b)} has been cancelled as requested.` : `${s.ownerName} has had to cancel your appointment on ${when(b)}.`,
      reason && by === "owner" ? `\nNote: ${reason}` : ``,
      ``,
      `Book a new time: ${appUrl()}/`,
      ``,
      s.ownerName,
    ].join("\n"),
    "client_cancelled",
    b.id,
  );
  if (by === "client") {
    await deliver(
      s.ownerEmail,
      `Cancelled: ${b.eventType.title} — ${b.client.name}`,
      [`${b.client.name} cancelled ${when(b, s.timezone)}.`, reason ? `Reason: ${reason}` : ``, `${appUrl()}/admin/bookings/${b.id}`].join("\n"),
      "owner_cancelled",
      b.id,
    );
  }
}

export async function sendReminder(b: BookingForEmail, kind: "24h" | "1h") {
  const s = await getSettings();
  const title = neutralTitle(b, s);
  await deliver(
    b.client.email,
    `Reminder: ${title} ${kind === "24h" ? "tomorrow" : "in 1 hour"} — ${DateTime.fromJSDate(b.startUtc, { zone: b.timezone }).toFormat("h:mm a")}`,
    [
      `Hi ${firstName(b.client.name)},`,
      ``,
      `A reminder about your appointment with ${s.businessName}.`,
      ``,
      `When: ${when(b)}`,
      `Where: ${where(b)}`,
      ``,
      `Need to change it? ${manageLink(b)}`,
      kind === "24h" ? policyLine(b, s) : ``,
    ].join("\n"),
    `reminder_${kind}`,
    b.id,
  );
}

/** A plain notice to the owner (e.g. storage warnings). */
export async function sendOwnerAlert(subject: string, body: string, kind: string) {
  const s = await getSettings();
  await deliver(s.ownerEmail, subject, body, kind);
}

/** Sends (or logs to the outbox) a ready-made email — used by automations. */
export async function sendEmail(to: string, subject: string, body: string, kind: string, bookingId?: string) {
  await deliver(to, subject, body, kind, bookingId);
}

/** Values for automation {placeholders}, from one booking. */
export async function emailVariables(b: BookingForEmail & { client: { name: string; email: string; phone?: string | null }; eventType: { slug?: string } }) {
  const s = await getSettings();
  const d = DateTime.fromJSDate(b.startUtc, { zone: b.timezone });
  return {
    first_name: firstName(b.client.name),
    name: b.client.name,
    email: b.client.email,
    phone: b.phone ?? b.client.phone ?? "",
    event_name: b.eventType.title,
    appointment: neutralTitle(b, s),
    date: d.toFormat("cccc d LLLL yyyy"),
    time: d.toFormat("h:mm a"),
    timezone: b.timezone.replace(/_/g, " "),
    duration: `${b.eventType.durationMinutes} minutes`,
    location: where(b),
    meet_link: b.meetUrl ?? "",
    manage_link: manageLink(b),
    rebook_link: b.eventType.slug ? `${appUrl()}/${b.eventType.slug}` : `${appUrl()}/`,
    booking_page: `${appUrl()}/`,
    owner_name: s.ownerName,
    business_name: s.businessName,
  } as Record<string, string>;
}
