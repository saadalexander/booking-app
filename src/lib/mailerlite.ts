/**
 * MailerLite: when someone books a booking type that has a MailerLite group set, they're added to
 * that group (which starts your MailerLite automations) with their call details in custom fields:
 *   {prefix}_date  "2026-11-17"                                        (date field — drives "N days before")
 *   {prefix}_when  "Tuesday 17 November at 5:40am (Melbourne time)"   (their own timezone)
 *   {prefix}_link  the Google Meet link
 * Rescheduling updates the fields; cancelling removes them from the group so the sequence stops.
 * Never throws — a MailerLite problem is recorded on the booking (mailerliteSyncError) instead.
 */
import "server-only";
import { DateTime } from "luxon";
import { decrypt } from "./crypto";
import { prisma } from "./db";
import { getSettings } from "./settings";

const API = process.env.MAILERLITE_API_URL || "https://connect.mailerlite.com/api";

export async function mailerliteKey(): Promise<string | null> {
  const s = await getSettings();
  if (!s.mailerliteKey) return null;
  try {
    return decrypt(s.mailerliteKey);
  } catch {
    return null;
  }
}

async function ml<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`MailerLite ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204 || res.status === 404) return {} as T;
  return (await res.json()) as T;
}

/** Checks a key works (used when you save it). */
export async function testMailerliteKey(key: string) {
  const r = await fetch(`${API}/groups?limit=1`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  return r.ok;
}

export function whenText(start: Date, tz: string) {
  const d = DateTime.fromJSDate(start, { zone: tz });
  const city = tz.split("/").pop()!.replace(/_/g, " ");
  return `${d.toFormat("cccc d LLLL 'at' h:mm")}${d.toFormat("a").toLowerCase()} (${city} time)`;
}

/** The subscriber payload for a booking (exported for tests). */
export function subscriberPayload(
  b: { startUtc: Date; timezone: string; meetUrl: string | null; phone: string | null; client: { name: string; email: string; phone: string | null } },
  groupId: string,
  prefix: string | null,
) {
  const [first, ...rest] = b.client.name.trim().split(/\s+/);
  const fields: Record<string, string | null> = { name: first || b.client.name, last_name: rest.join(" ") || null };
  const phone = b.phone || b.client.phone;
  if (phone) fields.phone = phone;
  if (prefix) {
    fields[`${prefix}_date`] = DateTime.fromJSDate(b.startUtc, { zone: b.timezone }).toISODate();
    fields[`${prefix}_when`] = whenText(b.startUtc, b.timezone);
    fields[`${prefix}_link`] = b.meetUrl ?? "";
  }
  return { email: b.client.email, fields, groups: [groupId] };
}

async function record(bookingId: string, error: string | null) {
  await prisma.booking.update({ where: { id: bookingId }, data: { mailerliteSyncError: error } }).catch(() => {});
}

/** New booking or reschedule: add/update the person in the booking type's MailerLite group. */
export async function syncBookedToMailerlite(bookingId: string, previousBookingId?: string | null) {
  try {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { client: true, eventType: { select: { mailerliteGroupId: true, mailerliteFieldPrefix: true } } },
    });
    if (!b || b.source || !b.eventType.mailerliteGroupId) return;
    const key = await mailerliteKey();
    if (!key) return record(b.id, "MailerLite isn't connected (add the API key in Google & email)");
    await ml(key, "/subscribers", { method: "POST", body: JSON.stringify(subscriberPayload(b, b.eventType.mailerliteGroupId, b.eventType.mailerliteFieldPrefix)) });
    await record(b.id, null);
    if (previousBookingId) await record(previousBookingId, null);
  } catch (e) {
    console.error("mailerlite sync failed", e);
    await record(bookingId, (e instanceof Error ? e.message : String(e)).slice(0, 500));
  }
}

/** Cancelled (not rescheduled): take them out of the group so the sequence stops, and clear the date. */
export async function syncCancelledToMailerlite(bookingId: string) {
  try {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { client: true, eventType: { select: { mailerliteGroupId: true, mailerliteFieldPrefix: true } } },
    });
    if (!b || b.source || !b.eventType.mailerliteGroupId) return;
    // Still booked for another call of this type? Leave them in.
    const other = await prisma.booking.count({
      where: { id: { not: b.id }, clientId: b.clientId, eventTypeId: b.eventTypeId, status: "confirmed", startUtc: { gt: new Date() } },
    });
    if (other > 0) return;
    const key = await mailerliteKey();
    if (!key) return record(b.id, "MailerLite isn't connected (add the API key in Google & email)");
    const sub = await ml<{ data?: { id: string } }>(key, `/subscribers/${encodeURIComponent(b.client.email)}`);
    if (!sub.data?.id) return record(b.id, null);
    const prefix = b.eventType.mailerliteFieldPrefix;
    if (prefix) {
      await ml(key, `/subscribers/${sub.data.id}`, { method: "PUT", body: JSON.stringify({ fields: { [`${prefix}_date`]: null, [`${prefix}_when`]: null, [`${prefix}_link`]: null } }) });
    }
    await ml(key, `/subscribers/${sub.data.id}/groups/${b.eventType.mailerliteGroupId}`, { method: "DELETE" });
    await record(b.id, null);
  } catch (e) {
    console.error("mailerlite cancel sync failed", e);
    await record(bookingId, (e instanceof Error ? e.message : String(e)).slice(0, 500));
  }
}

/** Your MailerLite groups, for the booking-type editor's dropdown (empty when not connected). */
export async function listMailerliteGroups(): Promise<{ id: string; name: string }[]> {
  const key = await mailerliteKey();
  if (!key) return [];
  try {
    const r = await ml<{ data?: { id: string; name: string }[] }>(key, "/groups?limit=100&sort=name");
    return (r.data ?? []).map((g) => ({ id: String(g.id), name: g.name }));
  } catch {
    return [];
  }
}
