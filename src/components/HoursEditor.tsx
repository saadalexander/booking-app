"use client";

import { useMemo } from "react";

export type Rule = { weekday: number; startMinute: number; endMinute: number };
export type Override = { date: string; startMinute: number | null; endMinute: number | null };
export type Hours = { timezone: string; rules: Rule[]; overrides: Override[] };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** "9:00am", "12:30pm", "12:00am (midnight)" for 0–1440 minutes. */
export function timeLabel(m: number) {
  if (m >= 1440) return "12:00am (midnight)";
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm}${h < 12 ? "am" : "pm"}`;
}

/** A dropdown of times every 15 minutes (like Calendly), keeping any odd existing value. */
function TimeSelect({ value, onChange, end = false, label }: { value: number; onChange: (m: number) => void; end?: boolean; label: string }) {
  const opts: number[] = [];
  for (let m = end ? 15 : 0; m <= (end ? 1440 : 1425); m += 15) opts.push(m);
  if (!opts.includes(value)) {
    opts.push(value);
    opts.sort((a, b) => a - b);
  }
  return (
    <select className="input !w-36" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
      {opts.map((m) => (
        <option key={m} value={m}>{timeLabel(m)}</option>
      ))}
    </select>
  );
}

/** Weekly hours + date overrides (+ optional timezone). Shared by schedules and per-booking-type custom hours. */
export default function HoursEditor({ value, onChange, showTimezone = true }: { value: Hours; onChange: (v: Hours) => void; showTimezone?: boolean }) {
  const { timezone, rules, overrides } = value;
  const setRules = (r: Rule[]) => onChange({ ...value, rules: r });
  const setOverrides = (o: Override[]) => onChange({ ...value, overrides: o });
  const timezones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
    } catch {
      return [timezone];
    }
  }, [timezone]);

  return (
    <div className="space-y-6">
      {showTimezone && (
        <label className="block max-w-sm">
          <span className="mb-1 block text-sm font-medium">Timezone</span>
          <select className="input" value={timezone} onChange={(e) => onChange({ ...value, timezone: e.target.value })}>
            {timezones.map((z) => (
              <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
      )}

      <div>
        <p className="mb-1 text-sm font-medium">Weekly hours</p>
        <div className="divide-y divide-stone-100">
          {DAYS.map((day, i) => {
            const weekday = i + 1;
            const ranges = rules.map((r, idx) => ({ r, idx })).filter(({ r }) => r.weekday === weekday);
            return (
              <div key={day} className="flex flex-wrap items-start gap-3 py-3">
                <label className="flex w-32 items-center gap-2 pt-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={ranges.length > 0}
                    onChange={(e) => setRules(e.target.checked ? [...rules, { weekday, startMinute: 540, endMinute: 1020 }] : rules.filter((r) => r.weekday !== weekday))}
                  />
                  {day}
                </label>
                <div className="flex-1 space-y-2">
                  {ranges.length === 0 && <p className="pt-2 text-sm text-stone-400">Unavailable</p>}
                  {ranges.map(({ r, idx }) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <TimeSelect label={`${day} start`} value={r.startMinute} onChange={(m) => setRules(rules.map((x, j) => (j === idx ? { ...x, startMinute: m } : x)))} />
                      –
                      <TimeSelect end label={`${day} end`} value={r.endMinute} onChange={(m) => setRules(rules.map((x, j) => (j === idx ? { ...x, endMinute: m } : x)))} />
                      <button type="button" className="text-stone-400 hover:text-red-700" aria-label="Remove range" onClick={() => setRules(rules.filter((_, j) => j !== idx))}>✕</button>
                    </div>
                  ))}
                  {ranges.length > 0 && (
                    <button type="button" className="text-xs text-stone-500 underline" onClick={() => setRules([...rules, { weekday, startMinute: 1080, endMinute: 1140 }])}>
                      + add another range
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Date overrides</p>
        <p className="mb-3 text-xs text-stone-500">Time off or different hours on specific dates.</p>
        <div className="space-y-2">
          {overrides.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="date" className="input !w-44" value={o.date} onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} required />
              <select
                className="input !w-40"
                value={o.startMinute == null ? "off" : "hours"}
                onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? (e.target.value === "off" ? { ...x, startMinute: null, endMinute: null } : { ...x, startMinute: 540, endMinute: 1020 }) : x)))}
              >
                <option value="off">Unavailable</option>
                <option value="hours">Custom hours</option>
              </select>
              {o.startMinute != null && o.endMinute != null && (
                <>
                  <TimeSelect label="Start" value={o.startMinute} onChange={(m) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, startMinute: m } : x)))} />–
                  <TimeSelect end label="End" value={o.endMinute} onChange={(m) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, endMinute: m } : x)))} />
                </>
              )}
              <button type="button" className="text-stone-400 hover:text-red-700" aria-label="Remove override" onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="mt-3 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm" onClick={() => setOverrides([...overrides, { date: new Date().toISOString().slice(0, 10), startMinute: null, endMinute: null }])}>
          + Add date override
        </button>
      </div>
    </div>
  );
}
