import { DateTime } from "luxon";

export const RANGES = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months", all: "All time" } as const;
export type RangeKey = keyof typeof RANGES;

export interface InsightBooking {
  id: string;
  status: string;
  startUtc: Date;
  endUtc: Date;
  createdAt: Date;
  cancelledBy: string | null;
  rescheduledFromId: string | null;
  clientId: string;
  clientName: string;
  clientEmail: string;
  eventTypeId: string;
  eventTypeTitle: string;
  categoryName: string | null;
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export function rangeStart(range: RangeKey, now: DateTime): DateTime | null {
  switch (range) {
    case "7d":
      return now.minus({ days: 7 }).startOf("day");
    case "30d":
      return now.minus({ days: 30 }).startOf("day");
    case "90d":
      return now.minus({ days: 90 }).startOf("day");
    case "12m":
      return now.minus({ months: 12 }).startOf("day");
    default:
      return null;
  }
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Everything on the Insights page, from bookings whose meeting time falls in [from, to).
 * `all` is every booking (any time) so we can tell new from returning contacts.
 * A booking that was moved counts once: the cancelled original of a reschedule is ignored.
 */
export function computeInsights(all: InsightBooking[], opts: { from: DateTime | null; to: DateTime; now: DateTime; tz: string; range: RangeKey }) {
  const { from, to, now, tz } = opts;
  const movedAway = new Set(all.map((b) => b.rescheduledFromId).filter(Boolean) as string[]);
  const real = all.filter((b) => !movedAway.has(b.id));
  const inRange = real.filter((b) => (!from || b.startUtc >= from.toJSDate()) && b.startUtc < to.toJSDate());
  const confirmed = inRange.filter((b) => b.status === "confirmed");
  const cancelled = inRange.filter((b) => b.status === "cancelled");
  const completed = confirmed.filter((b) => b.endUtc <= now.toJSDate());
  const upcoming = confirmed.filter((b) => b.startUtc > now.toJSDate());
  const rescheduled = inRange.filter((b) => b.rescheduledFromId);
  const bookedInRange = real.filter((b) => (!from || b.createdAt >= from.toJSDate()) && b.createdAt < to.toJSDate()).length;
  const minutes = confirmed.reduce((s, b) => s + (b.endUtc.getTime() - b.startUtc.getTime()) / 60_000, 0);

  // New vs returning contacts: "new" if their first-ever booking is in this period.
  const firstSeen = new Map<string, number>();
  for (const b of real) {
    const t = b.startUtc.getTime();
    if (!firstSeen.has(b.clientId) || t < firstSeen.get(b.clientId)!) firstSeen.set(b.clientId, t);
  }
  const contacts = new Set(confirmed.map((b) => b.clientId));
  const newContacts = [...contacts].filter((c) => !from || firstSeen.get(c)! >= from.toMillis()).length;

  // Lead time: days between booking and meeting.
  const leads = confirmed.map((b) => (b.startUtc.getTime() - b.createdAt.getTime()) / 86_400_000).filter((d) => d >= 0);
  const avgLeadDays = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null;

  // Over time: daily for ≤30 days, weekly for ≤90 days, else monthly.
  const firstStart = from ?? (confirmed.length ? DateTime.fromJSDate(confirmed.reduce((m, b) => (b.startUtc < m ? b.startUtc : m), confirmed[0].startUtc), { zone: tz }) : now);
  const span = to.diff(firstStart, "days").days;
  const unit: "day" | "week" | "month" = span <= 31 ? "day" : span <= 130 ? "week" : "month";
  const bucketKey = (d: DateTime) => d.startOf(unit).toISODate()!;
  const buckets = new Map<string, number>();
  for (let d = firstStart.setZone(tz).startOf(unit); d < to; d = d.plus({ [unit + "s"]: 1 })) buckets.set(bucketKey(d), 0);
  for (const b of confirmed) {
    const k = bucketKey(DateTime.fromJSDate(b.startUtc, { zone: tz }));
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + 1);
  }
  const fmt = unit === "month" ? "LLL yy" : "d LLL";
  const overTime: Bar[] = [...buckets].map(([k, v]) => ({
    key: k,
    label: DateTime.fromISO(k, { zone: tz }).toFormat(fmt),
    value: v,
    hint: unit === "week" ? `Week of ${DateTime.fromISO(k, { zone: tz }).toFormat("d LLL")}` : DateTime.fromISO(k, { zone: tz }).toFormat(unit === "month" ? "LLLL yyyy" : "cccc d LLL"),
  }));

  const count = (rows: InsightBooking[], key: (b: InsightBooking) => string, label: (b: InsightBooking) => string) => {
    const m = new Map<string, Bar>();
    for (const b of rows) {
      const k = key(b);
      const bar = m.get(k) ?? { key: k, label: label(b), value: 0 };
      bar.value++;
      m.set(k, bar);
    }
    return [...m.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  };

  const byType = count(confirmed, (b) => b.eventTypeId, (b) => b.eventTypeTitle);
  const byCategory = count(confirmed, (b) => b.categoryName ?? "Uncategorised", (b) => b.categoryName ?? "Uncategorised");
  const topContacts = count(confirmed, (b) => b.clientId, (b) => b.clientName).slice(0, 8);
  const cancelledByType = count(cancelled, (b) => b.eventTypeId, (b) => b.eventTypeTitle);

  const weekday: Bar[] = WEEKDAYS.map((d, i) => ({ key: String(i + 1), label: d, value: 0 }));
  const hours = new Map<number, number>();
  for (const b of confirmed) {
    const local = DateTime.fromJSDate(b.startUtc, { zone: tz });
    weekday[local.weekday - 1].value++;
    hours.set(local.hour, (hours.get(local.hour) ?? 0) + 1);
  }
  const hourKeys = [...hours.keys()];
  const hourBars: Bar[] = [];
  if (hourKeys.length) {
    for (let h = Math.min(...hourKeys); h <= Math.max(...hourKeys); h++) {
      hourBars.push({ key: String(h), label: DateTime.fromObject({ hour: h }).toFormat("ha").toLowerCase(), value: hours.get(h) ?? 0 });
    }
  }

  const total = confirmed.length + cancelled.length;
  return {
    totals: {
      meetings: confirmed.length,
      completed: completed.length,
      upcoming: upcoming.length,
      cancelled: cancelled.length,
      cancelRate: total ? cancelled.length / total : 0,
      rescheduled: rescheduled.length,
      bookedInRange,
      hours: minutes / 60,
      contacts: contacts.size,
      newContacts,
      returningContacts: contacts.size - newContacts,
      avgLeadDays,
    },
    unit,
    overTime,
    byType,
    byCategory,
    weekday,
    hourBars,
    topContacts,
    cancelledByType,
  };
}
