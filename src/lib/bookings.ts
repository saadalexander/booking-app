import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "./db";
import { getAvailability, getEventTypeBySlug, isValidTimezone, type FullEventType } from "./availability";
import { sendBookingConfirmation, sendCancellation, sendReminder, type BookingForEmail } from "./email";
import { changeWindowHours, getSettings, parseJson, type Consent } from "./settings";
import { deleteUpload, writeUpload } from "./storage";
import { syncBooked, syncCancelled } from "./calendar-sync";
import { runInstantWorkflows } from "./workflows";
import { syncBookedToMailerlite, syncCancelledToMailerlite } from "./mailerlite";

export class BookingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_QUESTION = 5;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export const bookingInput = z.object({
  slug: z.string().min(1),
  start: z.string().min(1),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  phone: z.string().trim().max(40).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  guests: z.array(z.string().trim().toLowerCase().email()).max(5).optional().default([]),
  answers: z.record(z.string(), z.union([z.string().max(5000), z.array(z.string().max(500))])).optional().default({}),
  consents: z.record(z.string(), z.boolean()).optional().default({}),
  checklist: z.array(z.string()).optional().default([]),
  linkToken: z.string().optional(),
  rescheduleToken: z.string().optional(),
});
export type BookingInput = z.infer<typeof bookingInput>;

const token = () => randomBytes(24).toString("base64url");

const emailInclude = {
  client: { select: { name: true, email: true } },
  eventType: { select: { title: true, neutralTitle: true, durationMinutes: true, locationType: true, cancelWindowHours: true, minNoticeMinutes: true } },
} as const;

/** True if the client may still change (reschedule/cancel) this booking themselves. */
export async function clientCanChange(b: { startUtc: Date; status: string; eventType: { cancelWindowHours: number | null; minNoticeMinutes: number } }) {
  if (b.status !== "confirmed") return { ok: false, hours: 0 };
  const s = await getSettings();
  const hours = changeWindowHours(b.eventType, s.defaultCancelWindowHours);
  const ok = b.startUtc.getTime() - Date.now() >= hours * 3_600_000;
  return { ok, hours };
}

function validateForm(et: FullEventType, input: BookingInput, files: Map<string, File[]>) {
  const errors: string[] = [];
  if (et.collectPhone === "required" && !input.phone) errors.push("Please enter your phone number");
  for (const q of et.questions) {
    if (q.type === "file") {
      const list = files.get(q.key) ?? [];
      if (q.required && list.length === 0) errors.push(`Please upload: ${q.label}`);
      if (list.length > MAX_FILES_PER_QUESTION) errors.push(`Up to ${MAX_FILES_PER_QUESTION} files for: ${q.label}`);
      for (const f of list) {
        if (f.size > MAX_FILE_BYTES) errors.push(`${f.name} is larger than 10 MB`);
        if (!ALLOWED_MIME.has(f.type)) errors.push(`${f.name}: please upload a PDF or photo (JPG, PNG, HEIC)`);
      }
      continue;
    }
    const v = input.answers[q.key];
    const empty = v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === "");
    if (q.required && empty) {
      errors.push(`Please answer: ${q.label}`);
      continue;
    }
    if (!empty && (q.type === "select" || q.type === "multiselect")) {
      const options = parseJson<string[]>(q.options, []);
      const values = Array.isArray(v) ? v : [v!];
      if (values.some((x) => !options.includes(x))) errors.push(`Please choose a valid option for: ${q.label}`);
    }
  }
  for (const c of parseJson<Consent[]>(et.consents, [])) {
    if (c.required && !input.consents[c.key]) errors.push(`Please confirm: ${c.label}`);
  }
  const checklist = parseJson<string[]>(et.checklist, []);
  if (checklist.some((item) => !input.checklist.includes(item))) errors.push("Please tick every item in the checklist");
  if (input.guests.length && !et.allowGuests) errors.push("Guests aren't allowed for this appointment");
  if (errors.length) throw new BookingError(errors.join("\n"));
}

async function assertSlotAvailable(et: FullEventType, startIso: string, tz: string, excludeBookingId?: string) {
  const start = DateTime.fromISO(startIso, { setZone: true });
  if (!start.isValid) throw new BookingError("Invalid time");
  const viewerDay = start.setZone(et.lockTimezone ? et.schedule.timezone : tz).toISODate()!;
  const days = await getAvailability(et, viewerDay, viewerDay, tz, { excludeBookingId });
  const ok = days.some((d) => d.spots.some((s) => DateTime.fromISO(s.start).toMillis() === start.toMillis()));
  if (!ok) throw new BookingError("Sorry — that time was just taken or is no longer available. Please pick another time.", 409);
  return start.toUTC();
}

/** Optimistic double-booking guard: after inserting, make sure nothing else claimed the time. */
async function assertNoRace(et: FullEventType, bookingId: string, startUtc: Date, endUtc: Date) {
  const overlapping = await prisma.booking.findMany({
    where: { status: "confirmed", id: { not: bookingId }, startUtc: { lt: endUtc }, endUtc: { gt: startUtc } },
    select: { eventTypeId: true, startUtc: true, createdAt: true },
  });
  const sameGroup = overlapping.filter((b) => et.seats && b.eventTypeId === et.id && b.startUtc.getTime() === startUtc.getTime());
  const others = overlapping.filter((b) => !sameGroup.includes(b));
  if (others.length > 0 || (et.seats && sameGroup.length + 1 > et.seats)) {
    await prisma.booking.delete({ where: { id: bookingId } });
    throw new BookingError("Sorry — that time was just taken. Please pick another time.", 409);
  }
}

async function saveFiles(files: Map<string, File[]>) {
  const saved: { questionKey: string; originalName: string; storedName: string; mimeType: string; size: number }[] = [];
  if (![...files.values()].some((l) => l.length)) return saved;
  for (const [questionKey, list] of files) {
    for (const f of list) {
      const storedName = randomBytes(16).toString("hex") + (EXT[f.type] ?? "");
      await writeUpload(storedName, Buffer.from(await f.arrayBuffer()));
      saved.push({ questionKey, originalName: f.name.slice(0, 200), storedName, mimeType: f.type, size: f.size });
    }
  }
  return saved;
}

export async function createBooking(input: BookingInput, files: Map<string, File[]>) {
  const et = await getEventTypeBySlug(input.slug);
  if (!et) throw new BookingError("This booking link doesn't exist", 404);

  // Rescheduling: the new booking replaces an existing one and keeps its details.
  let previous: Awaited<ReturnType<typeof loadByToken>> = null;
  if (input.rescheduleToken) {
    previous = await loadByToken(input.rescheduleToken);
    if (!previous || previous.eventTypeId !== et.id) throw new BookingError("Booking to reschedule not found", 404);
    const policy = await clientCanChange(previous);
    if (!policy.ok) throw new BookingError(`This appointment can't be changed online within ${policy.hours} hours of the start. Please get in touch directly.`, 403);
  } else {
    validateForm(et, input, files);
  }

  let link: { id: string } | null = null;
  if (input.linkToken) {
    const found = await prisma.singleUseLink.findUnique({ where: { token: input.linkToken } });
    if (!found || found.eventTypeId !== et.id) throw new BookingError("This private booking link isn't valid", 404);
    if (found.usedAt) throw new BookingError("This private booking link has already been used", 410);
    link = { id: found.id };
  }

  const startUtc = await assertSlotAvailable(et, input.start, input.timezone, previous?.id);
  const endUtc = startUtc.plus({ minutes: et.durationMinutes });

  const saved = previous ? [] : await saveFiles(files);
  try {
    const email = previous ? previous.client.email : input.email;
    const clientId = previous
      ? previous.clientId
      : (
          await prisma.client.upsert({
          where: { email },
          update: { name: input.name, ...(input.phone ? { phone: input.phone } : {}) },
          create: { email, name: input.name, phone: input.phone || null },
          })
        ).id;

    const booking = await prisma.booking.create({
      data: {
        eventTypeId: et.id,
        clientId,
        startUtc: startUtc.toJSDate(),
        endUtc: endUtc.toJSDate(),
        timezone: input.timezone,
        manageToken: token(),
        answers: previous ? previous.answers : JSON.stringify(input.answers),
        consents: previous ? previous.consents : JSON.stringify(input.consents),
        checklistAcks: previous ? previous.checklistAcks : JSON.stringify(input.checklist),
        guests: previous ? previous.guests : JSON.stringify(input.guests),
        notes: previous ? previous.notes : input.notes || null,
        phone: previous ? previous.phone : input.phone || null,
        rescheduledFromId: previous?.id ?? null,
        linkId: link?.id ?? null,
        files: { create: saved },
      },
      include: emailInclude,
    });

    await assertNoRace(et, booking.id, booking.startUtc, booking.endUtc);

    if (previous) {
      await prisma.booking.update({
        where: { id: previous.id },
        data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "client", cancelReason: "Rescheduled" },
      });
      await prisma.upload.updateMany({ where: { bookingId: previous.id }, data: { bookingId: booking.id } });
    }
    if (link) await prisma.singleUseLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });

    // Calendar first, so the confirmation email can include the Meet link.
    const meetUrl = await syncBooked(booking, previous);
    await sendBookingConfirmation({ ...booking, meetUrl } as BookingForEmail, Boolean(previous));
    await runInstantWorkflows(booking.id, previous ? "booking_rescheduled" : "booking_created");
    await syncBookedToMailerlite(booking.id, previous?.id);
    return booking;
  } catch (e) {
    await Promise.all(saved.map((f) => deleteUpload(f.storedName)));
    throw e;
  }
}

export async function loadByToken(manageToken: string) {
  return prisma.booking.findUnique({ where: { manageToken }, include: { ...emailInclude, eventType: { include: { schedule: true } } } });
}

export async function cancelBooking(id: string, by: "client" | "owner", reason?: string | null) {
  const b = await prisma.booking.findUnique({ where: { id }, include: emailInclude });
  if (!b) throw new BookingError("Booking not found", 404);
  if (b.status !== "confirmed") throw new BookingError("This booking is already cancelled");
  if (by === "client") {
    const policy = await clientCanChange(b);
    if (!policy.ok) throw new BookingError(`Appointments can't be cancelled online within ${policy.hours} hours of the start. Please get in touch directly.`, 403);
  }
  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: by, cancelReason: reason || null },
    include: emailInclude,
  });
  await syncCancelled(updated);
  await sendCancellation(updated as BookingForEmail, by, reason);
  await runInstantWorkflows(updated.id, "booking_cancelled");
  await syncCancelledToMailerlite(updated.id);
  return updated;
}

/** Sends due 24 h and 1 h reminders. Safe to run repeatedly (e.g. every 5–15 minutes). */
export async function runReminders(now = new Date()) {
  if (!(await getSettings()).builtInReminders) return { checked: 0, sent: 0, builtInReminders: "off" };
  const in24h = new Date(now.getTime() + 24 * 3_600_000);
  const in1h = new Date(now.getTime() + 3_600_000);
  const due = await prisma.booking.findMany({
    where: { status: "confirmed", startUtc: { gt: now, lte: in24h } },
    include: emailInclude,
  });
  let sent = 0;
  for (const b of due) {
    // Skip a reminder that would arrive right after booking (booked < 2 h before the reminder point).
    if (b.startUtc <= in1h) {
      if (!b.reminder1hSentAt) {
        await sendReminder(b as BookingForEmail, "1h");
        await prisma.booking.update({ where: { id: b.id }, data: { reminder1hSentAt: now } });
        sent++;
      }
    } else if (!b.reminder24hSentAt && b.createdAt.getTime() < b.startUtc.getTime() - 26 * 3_600_000) {
      await sendReminder(b as BookingForEmail, "24h");
      await prisma.booking.update({ where: { id: b.id }, data: { reminder24hSentAt: now } });
      sent++;
    }
  }
  return { checked: due.length, sent };
}
