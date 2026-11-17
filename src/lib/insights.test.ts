import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { computeInsights, rangeStart, type InsightBooking } from "./insights";

const tz = "Australia/Brisbane";
const now = DateTime.fromISO("2026-11-12T12:00:00", { zone: tz });
let n = 0;
function b(start: string, extra: Partial<InsightBooking> = {}): InsightBooking {
  const s = DateTime.fromISO(start, { zone: tz });
  return {
    id: `b${++n}`,
    status: "confirmed",
    startUtc: s.toJSDate(),
    endUtc: s.plus({ minutes: 30 }).toJSDate(),
    createdAt: s.minus({ days: 2 }).toJSDate(),
    cancelledBy: null,
    rescheduledFromId: null,
    clientId: "c1",
    clientName: "Ann",
    clientEmail: "ann@example.com",
    eventTypeId: "t1",
    eventTypeTitle: "Inquiry",
    categoryName: "Inquiry calls",
    ...extra,
  };
}

describe("computeInsights", () => {
  it("counts meetings, cancellations, reschedules and contacts in the range", () => {
    const old = b("2026-01-05T10:00:00", { clientId: "c2", clientName: "Bob" });
    const moved = b("2026-11-03T10:00:00", { status: "cancelled", cancelledBy: "client" });
    const rows = [
      old,
      b("2026-11-02T09:00:00"), // Monday, Ann's first meeting in range
      moved,
      b("2026-11-05T10:00:00", { rescheduledFromId: moved.id }),
      b("2026-11-06T14:00:00", { clientId: "c2", clientName: "Bob", eventTypeId: "t2", eventTypeTitle: "Consult", categoryName: null }),
      b("2026-11-07T14:00:00", { status: "cancelled", cancelledBy: "owner" }),
      b("2026-11-20T09:00:00"), // upcoming
    ];
    const from = rangeStart("30d", now);
    const r = computeInsights(rows, { from, to: now.plus({ days: 30 }), now, tz, range: "30d" });
    expect(r.totals.meetings).toBe(4);
    expect(r.totals.upcoming).toBe(1);
    expect(r.totals.completed).toBe(3);
    expect(r.totals.cancelled).toBe(1); // the reschedule's original is not a cancellation
    expect(r.totals.rescheduled).toBe(1);
    expect(r.totals.contacts).toBe(2);
    expect(r.totals.newContacts).toBe(1); // Ann (Bob met in January)
    expect(r.totals.hours).toBe(2);
    expect(r.byType[0]).toMatchObject({ label: "Inquiry", value: 3 });
    expect(r.byCategory.map((c) => c.label)).toEqual(["Inquiry calls", "Uncategorised"]);
    expect(r.weekday.find((d) => d.label === "Mon")!.value).toBe(1);
    expect(r.unit).toBe("week");
    expect(r.overTime.reduce((s, x) => s + x.value, 0)).toBe(4);
  });

  it("handles no bookings", () => {
    const r = computeInsights([], { from: null, to: now, now, tz, range: "all" });
    expect(r.totals.meetings).toBe(0);
    expect(r.totals.avgLeadDays).toBeNull();
    expect(r.hourBars).toEqual([]);
  });
});
