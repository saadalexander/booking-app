import "server-only";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { appUrl } from "./settings";
import type { Busy } from "./slots";

/**
 * Google Calendar + Gmail for the owner's account, via plain REST calls.
 *
 * Scopes are the narrowest that cover the features:
 *  - calendar.calendarlist.readonly  choose calendars in the dashboard
 *  - calendar.freebusy               busy times from the calendars checked for conflicts
 *  - calendar.events                 create/move/cancel booking events (+ Meet links) and read the
 *                                    destination calendar so our own events aren't counted twice
 *  - gmail.send                      send booking emails from the owner's address
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
];

const CAL = "https://www.googleapis.com/calendar/v3";

export class GoogleError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${appUrl()}/api/google/callback`;
}

export function safeModeRecipient() {
  return process.env.SAFE_MODE_REDIRECT_TO?.trim() || null;
}

export function authUrl(state: string, loginHint?: string) {
  const qs = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) qs.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new GoogleError(`Google token error: ${data.error_description ?? data.error ?? res.status}`, res.status);
  return data;
}

/** Exchange the OAuth code and store the connection. Returns the connected email. */
export async function completeConnection(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new GoogleError("Google didn't return a refresh token — remove the app's access in your Google account and connect again.");
  const info = (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json())) as { email?: string };
  if (!info.email) throw new GoogleError("Couldn't read the Google account email");
  const granted = (t.scope ?? "").split(" ");
  const missing = GOOGLE_SCOPES.filter((s) => !["openid", "email"].includes(s) && !granted.includes(s));
  if (missing.length) throw new GoogleError(`Some permissions weren't granted: ${missing.map((m) => m.split("/").pop()).join(", ")}. Please connect again and allow all of them.`);
  const expires = Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000;
  const data = {
    email: info.email,
    refreshToken: encrypt(t.refresh_token),
    scopes: t.scope ?? "",
    lastError: null,
    accessToken: encrypt(t.access_token!),
    accessTokenExpires: new Date(expires),
  };
  await prisma.googleConnection.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  cached = { token: t.access_token!, expires };
  return info.email;
}

let cached: { token: string; expires: number } | null = null;

export async function getConnection() {
  return prisma.googleConnection.findUnique({ where: { id: 1 } });
}

async function accessToken() {
  if (cached && cached.expires > Date.now()) return cached.token;
  const conn = await getConnection();
  if (!conn) throw new GoogleError("Google isn't connected");
  // Another server may already have a fresh token: reuse it instead of asking Google again.
  if (conn.accessToken && conn.accessTokenExpires && conn.accessTokenExpires.getTime() > Date.now()) {
    try {
      cached = { token: decrypt(conn.accessToken), expires: conn.accessTokenExpires.getTime() };
      return cached.token;
    } catch {
      // unreadable (e.g. key changed) — fall through and refresh
    }
  }
  try {
    const t = await tokenRequest({ refresh_token: decrypt(conn.refreshToken), grant_type: "refresh_token" });
    cached = { token: t.access_token!, expires: Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000 };
    await prisma.googleConnection
      .update({ where: { id: 1 }, data: { accessToken: encrypt(cached.token), accessTokenExpires: new Date(cached.expires) } })
      .catch(() => {});
    return cached.token;
  } catch (e) {
    await prisma.googleConnection.update({ where: { id: 1 }, data: { lastError: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}

export async function disconnect() {
  const conn = await getConnection();
  if (conn) {
    // Best effort: revoke at Google, then forget locally.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(conn.refreshToken))}`, { method: "POST" }).catch(() => {});
    await prisma.googleConnection.delete({ where: { id: 1 } });
  }
  cached = null;
}

async function api<T>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (res.status === 401 && !retried) {
    // Saved token no longer accepted: forget it everywhere and try once with a fresh one.
    cached = null;
    await prisma.googleConnection.update({ where: { id: 1 }, data: { accessToken: null, accessTokenExpires: null } }).catch(() => {});
    return api<T>(url, init, true);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new GoogleError(`Google API ${res.status}: ${data?.error?.message ?? text.slice(0, 200)}`, res.status);
  return data as T;
}

// ---------- calendars ----------

export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const out: CalendarInfo[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) });
    const data = await api<{ items: { id: string; summary: string; summaryOverride?: string; primary?: boolean; accessRole: string }[]; nextPageToken?: string }>(`${CAL}/users/me/calendarList?${qs}`);
    for (const c of data.items) out.push({ id: c.id, summary: c.summaryOverride ?? c.summary, primary: Boolean(c.primary), accessRole: c.accessRole });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

const busyCache = new Map<string, { at: number; busy: Busy[] }>();

/**
 * Busy time from the owner's calendars between `from` and `to`.
 * Events this app created are excluded (our own bookings are already counted from the database).
 */
export async function getGoogleBusy(from: Date, to: Date): Promise<Busy[]> {
  const conn = await getConnection();
  if (!conn) return [];
  const key = `${from.toISOString()}|${to.toISOString()}|${conn.conflictCalendarIds}|${conn.destinationCalendarId}`;
  const hit = busyCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.busy;
  const shared = await sharedCacheGet(key);
  if (shared) {
    busyCache.set(key, { at: shared.at, busy: shared.busy });
    return shared.busy;
  }

  const dest = conn.destinationCalendarId;
  const ids = (JSON.parse(conn.conflictCalendarIds) as string[]).filter((id) => id !== dest);
  await accessToken(); // get the token once before the parallel requests below

  // Other calendars (free/busy, batches of 50) and the destination calendar (event list) at the same time.
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const [others, own] = await Promise.all([
    Promise.all(
      batches.map(async (batch) => {
        const fb = await api<{ calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }> }>(`${CAL}/freeBusy`, {
          method: "POST",
          body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: batch.map((id) => ({ id })) }),
        });
        return Object.values(fb.calendars).flatMap((cal) => (cal.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) })));
      }),
    ),
    destinationBusy(dest, from, to),
  ]);
  const busy: Busy[] = [...others.flat(), ...own];

  busyCache.set(key, { at: Date.now(), busy });
  await sharedCachePut(key, busy);
  return busy;
}

/** Busy time on the destination calendar, skipping events this app created. */
async function destinationBusy(dest: string, from: Date, to: Date): Promise<Busy[]> {
  const busy: Busy[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", maxResults: "2500", ...(pageToken ? { pageToken } : {}) });
    const data = await api<{
      items: {
        status?: string;
        transparency?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        attendees?: { self?: boolean; responseStatus?: string }[];
        extendedProperties?: { private?: Record<string, string> };
      }[];
      nextPageToken?: string;
      timeZone?: string;
    }>(`${CAL}/calendars/${encodeURIComponent(dest)}/events?${qs}`);
    for (const ev of data.items) {
      if (ev.status === "cancelled" || ev.transparency === "transparent") continue;
      if (ev.extendedProperties?.private?.hbBookingId) continue;
      if (ev.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
      // All-day events give a bare date: it means midnight in the calendar's own timezone,
      // not UTC (which would shift the block into the next day, e.g. 11am in Melbourne).
      const at = (t?: { dateTime?: string; date?: string }) =>
        t?.dateTime ? Date.parse(t.dateTime) : t?.date ? DateTime.fromISO(t.date, { zone: data.timeZone || "UTC" }).toMillis() : NaN;
      const s = at(ev.start);
      const e = at(ev.end);
      if (Number.isFinite(s) && Number.isFinite(e)) busy.push({ start: s, end: e });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return busy;
}

/*
 * Cloudflare runs many copies of the app; the in-memory cache above only helps the copy that filled
 * it. This shared cache (Cloudflare's Cache API, private to this app) lets every copy reuse the
 * same 60-second calendar snapshot. Not available in local dev — then it does nothing.
 */
const SHARED_TTL = 60;
type CacheStorageLike = { open(name: string): Promise<Cache> };
const cacheStorage = () => (globalThis as unknown as { caches?: CacheStorageLike }).caches;
const cacheUrl = (key: string) => `https://google-busy.internal/${encodeURIComponent(key)}`;

async function sharedCacheGet(key: string): Promise<{ at: number; busy: Busy[] } | null> {
  try {
    const store = cacheStorage();
    if (!store) return null;
    const res = await (await store.open("google-busy")).match(cacheUrl(key));
    if (!res) return null;
    const data = (await res.json()) as { at: number; busy: Busy[] };
    return Date.now() - data.at < SHARED_TTL * 1000 ? data : null;
  } catch {
    return null;
  }
}

async function sharedCachePut(key: string, busy: Busy[]) {
  try {
    const store = cacheStorage();
    if (!store) return;
    const body = JSON.stringify({ at: Date.now(), busy });
    await (await store.open("google-busy")).put(cacheUrl(key), new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${SHARED_TTL}` } }));
  } catch {
    // cache is only an optimisation
  }
}

export function clearBusyCache() {
  busyCache.clear();
}

// ---------- booking events ----------

export interface EventInput {
  /** A 1:1 booking (excluded from busy time — bookings are counted from the database)… */
  bookingId?: string;
  /** …or a group event (kept as busy time, so it blocks 1:1 bookings). */
  groupEventId?: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timezone: string;
  attendees: string[];
  location?: string;
  withMeet: boolean;
}

export async function createEvent(input: EventInput): Promise<{ eventId: string; meetUrl: string | null }> {
  const conn = await getConnection();
  if (!conn) throw new GoogleError("Google isn't connected");
  const safe = safeModeRecipient();
  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.start.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timezone },
    location: input.location,
    // Safe mode: no attendees, so Google sends no invites while testing.
    attendees: safe ? [] : input.attendees.map((email) => ({ email })),
    guestsCanSeeOtherGuests: false,
    extendedProperties: { private: input.groupEventId ? { hbGroupEventId: input.groupEventId } : { hbBookingId: input.bookingId ?? "" } },
    ...(input.withMeet ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
  const qs = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: safe ? "none" : "all" });
  const ev = await api<{ id: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } }>(
    `${CAL}/calendars/${encodeURIComponent(conn.destinationCalendarId)}/events?${qs}`,
    { method: "POST", body: JSON.stringify(body) },
  );
  clearBusyCache();
  const meet = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return { eventId: ev.id, meetUrl: meet };
}

export async function moveEvent(eventId: string, start: Date, end: Date, timezone: string) {
  const conn = await getConnection();
  if (!conn) throw new GoogleError("Google isn't connected");
  const qs = new URLSearchParams({ sendUpdates: safeModeRecipient() ? "none" : "all" });
  await api(`${CAL}/calendars/${encodeURIComponent(conn.destinationCalendarId)}/events/${encodeURIComponent(eventId)}?${qs}`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: start.toISOString(), timeZone: timezone }, end: { dateTime: end.toISOString(), timeZone: timezone } }),
  });
  clearBusyCache();
}

/** Updates an event's details (title, description, time, location). */
export async function patchEvent(eventId: string, fields: { summary?: string; description?: string; location?: string; start?: Date; end?: Date; timezone?: string }) {
  const conn = await getConnection();
  if (!conn) throw new GoogleError("Google isn't connected");
  const body: Record<string, unknown> = {};
  if (fields.summary !== undefined) body.summary = fields.summary;
  if (fields.description !== undefined) body.description = fields.description;
  if (fields.location !== undefined) body.location = fields.location;
  if (fields.start && fields.end) {
    body.start = { dateTime: fields.start.toISOString(), timeZone: fields.timezone };
    body.end = { dateTime: fields.end.toISOString(), timeZone: fields.timezone };
  }
  await api(`${CAL}/calendars/${encodeURIComponent(conn.destinationCalendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  clearBusyCache();
}

export async function deleteEvent(eventId: string) {
  const conn = await getConnection();
  if (!conn) throw new GoogleError("Google isn't connected");
  const qs = new URLSearchParams({ sendUpdates: safeModeRecipient() ? "none" : "all" });
  try {
    await api(`${CAL}/calendars/${encodeURIComponent(conn.destinationCalendarId)}/events/${encodeURIComponent(eventId)}?${qs}`, { method: "DELETE" });
  } catch (e) {
    if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e; // already gone is fine
  }
  clearBusyCache();
}

// ---------- Gmail ----------

function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export async function sendGmail(opts: { to: string; subject: string; body: string; fromName: string }) {
  const conn = await getConnection();
  if (!conn) throw new GoogleError("Google isn't connected");
  const message = [
    `From: ${encodeHeader(opts.fromName)} <${conn.email}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  await api("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: Buffer.from(message, "utf8").toString("base64url") }),
  });
}
