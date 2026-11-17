/**
 * Slot engine — pure functions, no database access.
 *
 * Inputs describe one event type, its schedule and what is already busy; the output is,
 * for each day in the viewer's timezone, whether the day is bookable and which start
 * times are free (with remaining seats for group sessions).
 *
 * Buffer semantics: an event's own buffers must be free of other events, and existing
 * events' buffers must not be overlapped by the new event. Buffers may touch each other.
 */
import { DateTime, Interval as LxInterval } from "luxon";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday … 7 = Sunday

export interface Rule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface Override {
  date: string; // YYYY-MM-DD in schedule timezone
  startMinute: number | null; // null = unavailable all day
  endMinute: number | null;
}

export type Period =
  | { type: "unlimited" }
  | { type: "rolling"; days: number } // calendar days from today
  | { type: "rolling_window"; days: number } // first N days that have availability
  | { type: "range"; start: string; end: string }; // inclusive dates, schedule timezone

/** Something that occupies time: an existing booking or an external calendar event. */
export interface Busy {
  start: number; // epoch ms
  end: number;
  bufferBefore?: number; // minutes
  bufferAfter?: number;
}

/** Existing bookings of the same seated event type, grouped by start time. */
export interface SeatGroup {
  start: number;
  count: number;
}

export interface SlotInput {
  now: number;
  rangeStart: string; // YYYY-MM-DD, viewer timezone, inclusive
  rangeEnd: string; // YYYY-MM-DD, viewer timezone, inclusive
  viewerTz: string;
  scheduleTz: string;
  rules: Rule[];
  overrides: Override[];
  durationMinutes: number;
  slotIntervalMinutes?: number | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  period: Period;
  busy: Busy[];
  seats?: number | null;
  seatGroups?: SeatGroup[];
  dailyCap?: number | null;
  /** Confirmed bookings of this event type per schedule-local date (for dailyCap). */
  bookingsPerDate?: Record<string, number>;
  firstSlotOnly?: boolean;
  /**
   * Optimized slots: when a start time is blocked by an existing event, jump straight to the
   * first moment after that event (plus buffers) and continue the grid from there, instead of
   * waiting for the next fixed time (e.g. a call ending 9:20 offers 9:20, not 9:30).
   */
  optimizedSlots?: boolean;
}

export interface Spot {
  start: string; // ISO with viewer offset
  remaining: number | null; // seats left for group sessions, null for 1:1
}

export interface Day {
  date: string; // YYYY-MM-DD viewer timezone
  status: "available" | "unavailable";
  spots: Spot[];
}

const MINUTE = 60_000;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Availability windows (epoch ms) for one schedule-local date. */
export function windowsForDate(
  date: DateTime<boolean>, // start of day in schedule tz
  rules: Rule[],
  overrides: Override[],
): Array<[number, number]> {
  const iso = date.toISODate()!;
  const dayOverrides = overrides.filter((o) => o.date === iso);
  const ranges: Array<[number, number]> = [];
  if (dayOverrides.length > 0) {
    for (const o of dayOverrides) {
      if (o.startMinute == null || o.endMinute == null) return []; // whole day off
      ranges.push([o.startMinute, o.endMinute]);
    }
  } else {
    for (const r of rules) if (r.weekday === date.weekday) ranges.push([r.startMinute, r.endMinute]);
  }
  return ranges
    .filter(([s, e]) => e > s)
    .map(([s, e]) => [date.plus({ minutes: s }).toMillis(), date.plus({ minutes: e }).toMillis()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/** Candidate starts before period / conflict filtering, keyed by schedule-local date. */
function candidatesByScheduleDate(input: SlotInput, fromDay: DateTime<boolean>, toDay: DateTime<boolean>) {
  const step = (input.slotIntervalMinutes || input.durationMinutes) * MINUTE;
  const duration = input.durationMinutes * MINUTE;
  const out = new Map<string, number[]>();
  for (let d = fromDay; d <= toDay; d = d.plus({ days: 1 })) {
    const starts: number[] = [];
    for (const [ws, we] of windowsForDate(d, input.rules, input.overrides)) {
      for (let t = ws; t + duration <= we; t += step) starts.push(t);
    }
    if (starts.length) out.set(d.toISODate()!, starts);
  }
  return out;
}

export function computeSlots(input: SlotInput): Day[] {
  const viewStart = DateTime.fromISO(input.rangeStart, { zone: input.viewerTz }).startOf("day");
  const viewEnd = DateTime.fromISO(input.rangeEnd, { zone: input.viewerTz }).endOf("day");
  if (!viewStart.isValid || !viewEnd.isValid) throw new Error("Invalid range or timezone");

  const now = DateTime.fromMillis(input.now, { zone: input.scheduleTz });
  const today = now.startOf("day");

  // Schedule-local days that can produce starts inside the viewer range (±1 day for tz shifts).
  let fromDay: DateTime<boolean> = viewStart.setZone(input.scheduleTz).startOf("day").minus({ days: 1 });
  let toDay: DateTime<boolean> = viewEnd.setZone(input.scheduleTz).startOf("day").plus({ days: 1 });
  if (fromDay < today) fromDay = today;

  const period = input.period;
  let periodEndDay: DateTime<boolean> | null = null;
  let periodStartDay: DateTime<boolean> | null = null;
  if (period.type === "rolling") periodEndDay = today.plus({ days: Math.max(period.days, 0) - 1 });
  if (period.type === "range") {
    periodStartDay = DateTime.fromISO(period.start, { zone: input.scheduleTz }).startOf("day");
    periodEndDay = DateTime.fromISO(period.end, { zone: input.scheduleTz }).startOf("day");
  }
  if (periodStartDay && fromDay < periodStartDay) fromDay = periodStartDay;
  if (periodEndDay && toDay > periodEndDay) toDay = periodEndDay;

  const duration = input.durationMinutes * MINUTE;
  const earliest = input.now + input.minNoticeMinutes * MINUTE;
  const seats = input.seats && input.seats > 0 ? input.seats : null;
  const seatGroups = new Map((input.seatGroups ?? []).map((g) => [g.start, g.count]));

  // Existing group sessions of this event type occupy time like any other event
  // (for starts that are not joining them). `busy` must NOT contain those bookings.
  const groupBusy: Busy[] = [...seatGroups.keys()].map((s) => ({
    start: s,
    end: s + duration,
    bufferBefore: input.bufferBeforeMinutes,
    bufferAfter: input.bufferAfterMinutes,
  }));

  const isFree = (start: number): { ok: boolean; remaining: number | null } => {
    if (start < earliest) return { ok: false, remaining: null };
    const end = start + duration;
    const othersBusy = input.busy.some((b) => clash(start, end, b));
    if (seats) {
      const taken = seatGroups.get(start);
      if (taken !== undefined) {
        // Joining an existing group session: capacity plus everything else that is busy.
        if (taken >= seats) return { ok: false, remaining: 0 };
        return { ok: !othersBusy, remaining: seats - taken };
      }
      const groupClash = groupBusy.some((b) => clash(start, end, b));
      return { ok: !othersBusy && !groupClash, remaining: seats };
    }
    return { ok: !othersBusy, remaining: null };
  };

  function clash(start: number, end: number, b: Busy) {
    const ownStart = start - input.bufferBeforeMinutes * MINUTE;
    const ownEnd = end + input.bufferAfterMinutes * MINUTE;
    const theirStart = b.start - (b.bufferBefore ?? 0) * MINUTE;
    const theirEnd = b.end + (b.bufferAfter ?? 0) * MINUTE;
    return overlaps(ownStart, ownEnd, b.start, b.end) || overlaps(start, end, theirStart, theirEnd);
  }

  // Optimized slots: walk each availability window; when a start is blocked by something busy,
  // continue from the earliest moment after that event (with both sides' buffers) if it comes
  // before the next fixed step.
  const step = (input.slotIntervalMinutes || input.durationMinutes) * MINUTE;
  const allBusy = [...input.busy, ...groupBusy];
  const freeAfter = (b: Busy) => b.end + Math.max(input.bufferBeforeMinutes, b.bufferAfter ?? 0) * MINUTE;
  function optimizedStarts(date: string): number[] {
    const day = DateTime.fromISO(date, { zone: input.scheduleTz }).startOf("day");
    const out: number[] = [];
    for (const [ws, we] of windowsForDate(day, input.rules, input.overrides)) {
      let t = ws;
      while (t + duration <= we) {
        if (isFree(t).ok) {
          out.push(t);
          t += step;
          continue;
        }
        const end = t + duration;
        const blockers = allBusy.filter((b) => clash(t, end, b)).map(freeAfter).filter((a) => a > t);
        const jump = blockers.length ? Math.max(...blockers) : 0;
        t = jump > t && jump < t + step ? jump : t + step;
      }
    }
    return out;
  }

  // Collect free starts per schedule-local date.
  const freeBySchedDate = new Map<string, Spot[]>();
  // rolling_window needs to scan from today regardless of the viewer range.
  const scanFrom = period.type === "rolling_window" ? today : fromDay;
  const scanTo = period.type === "rolling_window" ? DateTime.max(toDay, today.plus({ days: 366 })) : toDay;
  const candidates = candidatesByScheduleDate(input, scanFrom, scanTo);
  let windowDaysLeft = period.type === "rolling_window" ? Math.max(period.days, 0) : Infinity;

  const sortedDates = [...candidates.keys()].sort();
  for (const date of sortedDates) {
    if (period.type === "rolling_window" && windowDaysLeft <= 0) break;
    if (input.dailyCap && (input.bookingsPerDate?.[date] ?? 0) >= input.dailyCap) continue;
    const spots: Spot[] = [];
    const starts = input.optimizedSlots ? optimizedStarts(date) : candidates.get(date)!;
    for (const start of starts) {
      const { ok, remaining } = isFree(start);
      if (!ok) continue;
      spots.push({ start: DateTime.fromMillis(start, { zone: input.viewerTz }).toISO()!, remaining });
      if (input.firstSlotOnly) break;
    }
    if (spots.length) {
      freeBySchedDate.set(date, spots);
      windowDaysLeft -= 1;
    }
  }

  // Re-bucket into viewer-local days within the requested range.
  const byViewerDate = new Map<string, Spot[]>();
  for (const spots of freeBySchedDate.values()) {
    for (const s of spots) {
      const dt = DateTime.fromISO(s.start, { setZone: true });
      if (dt < viewStart || dt > viewEnd) continue;
      const key = dt.toISODate()!;
      if (!byViewerDate.has(key)) byViewerDate.set(key, []);
      byViewerDate.get(key)!.push(s);
    }
  }

  const days: Day[] = [];
  for (const day of LxInterval.fromDateTimes(viewStart, viewEnd).splitBy({ days: 1 })) {
    const key = day.start!.toISODate()!;
    const spots = (byViewerDate.get(key) ?? []).sort((a, b) => a.start.localeCompare(b.start));
    days.push({ date: key, status: spots.length ? "available" : "unavailable", spots });
  }
  return days;
}
