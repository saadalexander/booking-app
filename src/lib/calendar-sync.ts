import "server-only";
import { prisma } from "./db";
import { createEvent, deleteEvent, getConnection, moveEvent } from "./google";
import { appUrl, getSettings, parseJson } from "./settings";

/**
 * Keeps Google Calendar in step with bookings. Never throws: a calendar problem must not undo a
 * booking the client has already made — it is recorded on the booking (googleSyncError) and shown
 * in the dashboard instead.
 */

type SyncBooking = {
  id: string;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
  manageToken: string;
  phone: string | null;
  guests: string;
  client: { name: string; email: string };
  eventType: { neutralTitle: string | null; locationType: string };
};

async function record(bookingId: string, data: { googleEventId?: string | null; meetUrl?: string | null; googleSyncError: string | null }) {
  await prisma.booking.update({ where: { id: bookingId }, data });
}

function errText(e: unknown) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

/** New booking or reschedule. Returns the Meet link (if any) for the confirmation email. */
export async function syncBooked(b: SyncBooking, previous?: { id: string; googleEventId: string | null; meetUrl: string | null } | null) {
  if (!(await getConnection())) {
    // Keep the link to the existing calendar event and Meet link even if Google can't be reached now,
    // and flag it so the owner can move the event by hand.
    if (previous?.googleEventId) {
      await record(b.id, { googleEventId: previous.googleEventId, meetUrl: previous.meetUrl, googleSyncError: "Google isn't connected — move the calendar event by hand" });
      await prisma.booking.update({ where: { id: previous.id }, data: { googleEventId: null } });
    }
    return previous?.meetUrl ?? null;
  }
  try {
    if (previous?.googleEventId) {
      await moveEvent(previous.googleEventId, b.startUtc, b.endUtc, b.timezone);
      await record(b.id, { googleEventId: previous.googleEventId, meetUrl: previous.meetUrl, googleSyncError: null });
      await prisma.booking.update({ where: { id: previous.id }, data: { googleEventId: null } });
      return previous.meetUrl;
    }
    const s = await getSettings();
    const title = b.eventType.neutralTitle?.trim() || `Appointment with ${s.ownerName}`;
    const isPhone = b.eventType.locationType === "phone";
    const { eventId, meetUrl } = await createEvent({
      bookingId: b.id,
      summary: `${title} — ${b.client.name}`,
      description: [`Booked through ${s.businessName}.`, ``, `Reschedule or cancel: ${appUrl()}/booking/${b.manageToken}`, `Owner details: ${appUrl()}/admin/bookings/${b.id}`].join("\n"),
      start: b.startUtc,
      end: b.endUtc,
      timezone: b.timezone,
      attendees: [b.client.email, ...parseJson<string[]>(b.guests, [])],
      location: isPhone ? `Phone call — ${s.ownerName} calls ${b.phone ?? "the client"}` : undefined,
      withMeet: b.eventType.locationType === "google_meet",
    });
    await record(b.id, { googleEventId: eventId, meetUrl, googleSyncError: null });
    return meetUrl;
  } catch (e) {
    console.error("calendar sync (book) failed", e);
    await record(b.id, { googleSyncError: errText(e) });
    return previous?.meetUrl ?? null;
  }
}

export async function syncCancelled(b: { id: string; googleEventId: string | null }) {
  if (!b.googleEventId || !(await getConnection())) return;
  try {
    await deleteEvent(b.googleEventId);
    await record(b.id, { googleSyncError: null });
  } catch (e) {
    console.error("calendar sync (cancel) failed", e);
    await record(b.id, { googleSyncError: errText(e) });
  }
}
