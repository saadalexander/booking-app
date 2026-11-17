import { DateTime } from "luxon";
import { prisma } from "./db";
import { getGoogleBusy } from "./google";
import { computeSlots, type Busy, type Day, type Period, type SeatGroup } from "./slots";

export async function getEventTypeBySlug(slug: string) {
  return prisma.eventType.findUnique({
    where: { slug },
    include: {
      schedule: { include: { rules: true, overrides: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
}

export type FullEventType = NonNullable<Awaited<ReturnType<typeof getEventTypeBySlug>>>;

export function periodOf(et: FullEventType): Period {
  switch (et.periodType) {
    case "rolling":
      return { type: "rolling", days: et.periodDays ?? 30 };
    case "rolling_window":
      return { type: "rolling_window", days: et.periodDays ?? 7 };
    case "range":
      return { type: "range", start: et.periodStart ?? "1970-01-01", end: et.periodEnd ?? "1970-01-01" };
    default:
      return { type: "unlimited" };
  }
}

const DAY = 86_400_000;

/** Busy time from the connected Google calendars, fetched in ≤60-day chunks, at most 120 days ahead. */
async function getExternalBusy(from: Date, to: Date): Promise<Busy[]> {
  // Snap the window to whole weeks (UTC) so nearby requests — the same month viewed from another
  // timezone, or a few seconds later — ask Google for the identical range and hit the 60 s cache.
  const WEEK = 7 * DAY;
  const start = Math.floor(from.getTime() / WEEK) * WEEK;
  const end = Math.min(Math.ceil(to.getTime() / WEEK) * WEEK, start + 18 * WEEK);
  const chunks: [number, number][] = [];
  for (let s = start; s < end; s += 8 * WEEK) chunks.push([s, Math.min(end, s + 8 * WEEK)]);
  const results = await Promise.all(chunks.map(([s, e]) => getGoogleBusy(new Date(s), new Date(e))));
  return results.flat();
}

export function isValidTimezone(tz: string) {
  return DateTime.local().setZone(tz).isValid;
}

export async function getAvailability(
  et: FullEventType,
  rangeStart: string,
  rangeEnd: string,
  viewerTz: string,
  opts: { excludeBookingId?: string; now?: number } = {},
): Promise<Day[]> {
  const now = opts.now ?? Date.now();
  const tz = et.lockTimezone ? et.schedule.timezone : viewerTz;
  // Load a generous window: rolling_window scans ahead from today.
  const from = DateTime.fromISO(rangeStart, { zone: tz }).minus({ days: 2 }).toJSDate();
  const to =
    et.periodType === "rolling_window"
      ? DateTime.fromMillis(now).plus({ days: 400 }).toJSDate()
      : DateTime.fromISO(rangeEnd, { zone: tz }).plus({ days: 2 }).toJSDate();
  const lower = new Date(Math.min(from.getTime(), now - 2 * 86_400_000));

  const bookings = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      endUtc: { gt: lower },
      startUtc: { lt: to },
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
    },
    select: {
      id: true,
      eventTypeId: true,
      startUtc: true,
      endUtc: true,
      eventType: { select: { bufferBeforeMinutes: true, bufferAfterMinutes: true } },
    },
  });

  const busy: Busy[] = [];
  const groups = new Map<number, number>();
  const perDate: Record<string, number> = {};
  for (const b of bookings) {
    if (b.eventTypeId === et.id) {
      const d = DateTime.fromJSDate(b.startUtc, { zone: et.schedule.timezone }).toISODate()!;
      perDate[d] = (perDate[d] ?? 0) + 1;
      if (et.seats) {
        const k = b.startUtc.getTime();
        groups.set(k, (groups.get(k) ?? 0) + 1);
        continue;
      }
    }
    busy.push({
      start: b.startUtc.getTime(),
      end: b.endUtc.getTime(),
      bufferBefore: b.eventType.bufferBeforeMinutes,
      bufferAfter: b.eventType.bufferAfterMinutes,
    });
  }
  // Your group events block 1:1 times too (even when Google Calendar isn't connected).
  const groupEvents = await prisma.groupEvent.findMany({
    where: { status: "published", startUtc: { lt: to }, endUtc: { gt: lower } },
    select: { startUtc: true, endUtc: true },
  });
  for (const g of groupEvents) busy.push({ start: g.startUtc.getTime(), end: g.endUtc.getTime() });
  busy.push(...(await getExternalBusy(lower, to)));
  const seatGroups: SeatGroup[] = [...groups].map(([start, count]) => ({ start, count }));

  return computeSlots({
    now,
    rangeStart,
    rangeEnd,
    viewerTz: tz,
    scheduleTz: et.schedule.timezone,
    rules: et.schedule.rules,
    overrides: et.schedule.overrides,
    durationMinutes: et.durationMinutes,
    slotIntervalMinutes: et.slotIntervalMinutes,
    bufferBeforeMinutes: et.bufferBeforeMinutes,
    bufferAfterMinutes: et.bufferAfterMinutes,
    minNoticeMinutes: et.minNoticeMinutes,
    period: periodOf(et),
    busy,
    seats: et.seats,
    seatGroups,
    dailyCap: et.dailyCap,
    bookingsPerDate: perDate,
    firstSlotOnly: et.firstSlotOnly,
    optimizedSlots: et.optimizedSlots,
  });
}

/** First bookable date (viewer tz) within the next year, scanning month by month. */
export async function findNextAvailableDate(et: FullEventType, viewerTz: string): Promise<string | null> {
  const tz = et.lockTimezone ? et.schedule.timezone : viewerTz;
  let cursor = DateTime.now().setZone(tz).startOf("day");
  for (let i = 0; i < 12; i++) {
    const end = cursor.plus({ days: 30 });
    const days = await getAvailability(et, cursor.toISODate()!, end.toISODate()!, viewerTz);
    const hit = days.find((d) => d.status === "available");
    if (hit) return hit.date;
    cursor = end.plus({ days: 1 });
  }
  return null;
}
