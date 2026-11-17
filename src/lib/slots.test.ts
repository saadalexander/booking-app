import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { computeSlots, type SlotInput } from "./slots";

const MEL = "Australia/Melbourne";
// Example working hours: Tue, Wed, Fri 09:00–17:00; Thu 09:00–15:00.
const workingHours = [
  { weekday: 2, startMinute: 540, endMinute: 1020 },
  { weekday: 3, startMinute: 540, endMinute: 1020 },
  { weekday: 4, startMinute: 540, endMinute: 900 },
  { weekday: 5, startMinute: 540, endMinute: 1020 },
];
// Monday 9 Nov 2026, 08:00 Melbourne.
const NOW = DateTime.fromISO("2026-11-09T08:00", { zone: MEL }).toMillis();

function base(overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    now: NOW,
    rangeStart: "2026-11-09",
    rangeEnd: "2026-11-15",
    viewerTz: MEL,
    scheduleTz: MEL,
    rules: workingHours,
    overrides: [],
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 0,
    period: { type: "unlimited" },
    busy: [],
    ...overrides,
  };
}
const at = (iso: string, zone = MEL) => DateTime.fromISO(iso, { zone }).toMillis();
const times = (days: ReturnType<typeof computeSlots>, date: string) =>
  days.find((d) => d.date === date)!.spots.map((s) => DateTime.fromISO(s.start, { setZone: true }).toFormat("HH:mm"));

describe("computeSlots", () => {
  it("follows the weekly schedule (Mon off, Thu short day)", () => {
    const days = computeSlots(base());
    expect(days.map((d) => d.status)).toEqual([
      "unavailable", "available", "available", "available", "available", "unavailable", "unavailable",
    ]);
    expect(times(days, "2026-11-10")).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
    expect(times(days, "2026-11-12")).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]);
  });

  it("applies minimum notice (Cal.com 14400 min = 10 days)", () => {
    // 10 days after Mon 9 Nov 08:00 is Thu 19 Nov 08:00: Tue 17 / Wed 18 are too soon.
    const days = computeSlots(base({ minNoticeMinutes: 14400, rangeEnd: "2026-11-22" }));
    expect(days.filter((d) => d.status === "available").map((d) => d.date)).toEqual(["2026-11-19", "2026-11-20"]);
    expect(times(days, "2026-11-19")[0]).toBe("09:00");
  });

  it("blocks busy time and respects both sides' buffers", () => {
    const busy = [{ start: at("2026-11-10T11:00"), end: at("2026-11-10T12:00"), bufferBefore: 0, bufferAfter: 10 }];
    const days = computeSlots(base({ busy, bufferBeforeMinutes: 5, bufferAfterMinutes: 5 }));
    // 10:00–11:00 + 5 min after would overlap 11:00 → blocked. 12:00 start overlaps their 10 min buffer → blocked.
    expect(times(days, "2026-11-10")).toEqual(["09:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("optimized slots continue right after an existing booking", () => {
    // 30-min call every 30 min; an existing booking 9:00–10:20 on Tue.
    const busy = [{ start: at("2026-11-10T09:00"), end: at("2026-11-10T10:20") }];
    const fixed = computeSlots(base({ busy, durationMinutes: 30 }));
    expect(times(fixed, "2026-11-10").slice(0, 3)).toEqual(["10:30", "11:00", "11:30"]);
    const optimized = computeSlots(base({ busy, durationMinutes: 30, optimizedSlots: true }));
    expect(times(optimized, "2026-11-10").slice(0, 3)).toEqual(["10:20", "10:50", "11:20"]);
    // Buffers still apply: with 10 min before, the first start is 10:30.
    const buffered = computeSlots(base({ busy, durationMinutes: 30, optimizedSlots: true, bufferBeforeMinutes: 10 }));
    expect(times(buffered, "2026-11-10")[0]).toBe("10:30");
    // No bookings that day → same as fixed times.
    expect(times(optimized, "2026-11-11")).toEqual(times(fixed, "2026-11-11"));
  });

  it("uses date overrides (day off and custom hours)", () => {
    const overrides = [
      { date: "2026-11-10", startMinute: null, endMinute: null },
      { date: "2026-11-11", startMinute: 780, endMinute: 900 },
    ];
    const days = computeSlots(base({ overrides }));
    expect(times(days, "2026-11-10")).toEqual([]);
    expect(times(days, "2026-11-11")).toEqual(["13:00", "14:00"]);
  });

  it("converts to the viewer's timezone", () => {
    const days = computeSlots(base({ viewerTz: "Europe/London", rangeStart: "2026-11-09", rangeEnd: "2026-11-10" }));
    // Tue 10 Nov 09:00 Melbourne (UTC+11) = Mon 9 Nov 22:00 London.
    expect(times(days, "2026-11-09")).toEqual(["22:00", "23:00"]);
  });

  it("supports group sessions with seats", () => {
    const start = at("2026-11-10T09:00");
    const days = computeSlots(base({ seats: 5, seatGroups: [{ start, count: 3 }] }));
    const first = days.find((d) => d.date === "2026-11-10")!.spots[0];
    expect(first.remaining).toBe(2);
    const full = computeSlots(base({ seats: 5, seatGroups: [{ start, count: 5 }] }));
    expect(times(full, "2026-11-10")[0]).toBe("10:00");
  });

  it("rolling period counts calendar days from today", () => {
    const days = computeSlots(base({ period: { type: "rolling", days: 3 } }));
    expect(days.filter((d) => d.status === "available").map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
  });

  it("rolling window counts only days that have availability", () => {
    const days = computeSlots(base({ period: { type: "rolling_window", days: 2 }, rangeEnd: "2026-11-30" }));
    expect(days.filter((d) => d.status === "available").map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
  });

  it("fixed date range in the past yields nothing (Cal.com info call ended 5 Jul 2026)", () => {
    const days = computeSlots(base({ period: { type: "range", start: "2026-07-05", end: "2026-07-05" } }));
    expect(days.every((d) => d.status === "unavailable")).toBe(true);
  });

  it("daily cap and first-slot-only", () => {
    const capped = computeSlots(base({ dailyCap: 1, bookingsPerDate: { "2026-11-10": 1 } }));
    expect(times(capped, "2026-11-10")).toEqual([]);
    const first = computeSlots(base({ firstSlotOnly: true }));
    expect(times(first, "2026-11-11")).toEqual(["09:00"]);
  });

  it("never offers times in the past", () => {
    const later = DateTime.fromISO("2026-11-10T13:30", { zone: MEL }).toMillis();
    const days = computeSlots(base({ now: later }));
    expect(times(days, "2026-11-10")).toEqual(["14:00", "15:00", "16:00"]);
  });
});

import { changeWindowHours } from "./policy";
describe("changeWindowHours", () => {
  it("is never stricter than the booking notice", () => {
    expect(changeWindowHours({ cancelWindowHours: null, minNoticeMinutes: 14400 }, 24)).toBe(24); // 10 days notice → 24 h
    expect(changeWindowHours({ cancelWindowHours: null, minNoticeMinutes: 240 }, 24)).toBe(4); // inquiry call
    expect(changeWindowHours({ cancelWindowHours: null, minNoticeMinutes: 120 }, 24)).toBe(2); // info call
    expect(changeWindowHours({ cancelWindowHours: 48, minNoticeMinutes: 0 }, 24)).toBe(0);
    expect(changeWindowHours({ cancelWindowHours: 2, minNoticeMinutes: 14400 }, 24)).toBe(2);
  });
});
