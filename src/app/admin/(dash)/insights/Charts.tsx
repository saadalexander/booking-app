"use client";

import { useState } from "react";
import type { Bar } from "@/lib/insights";

// Dark blue-grey from the brand palette (red is kept for highlights and warnings only).
const MARK = "#151B1F";

/** Single-series column chart (time, weekday, hour) with a hover tooltip. */
export function Columns({ bars, unit = "booking", height = 180, labelEvery }: { bars: Bar[]; unit?: string; height?: number; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const step = labelEvery ?? Math.max(1, Math.ceil(bars.length / 12));
  const peak = bars.reduce((m, b, i) => (b.value > bars[m].value ? i : m), 0);
  if (bars.length === 0) return <p className="py-8 text-center text-sm text-stone-500">No bookings in this period.</p>;
  return (
    <div>
      <div className="relative flex items-end gap-[2px] border-b border-stone-200" style={{ height }} onMouseLeave={() => setHover(null)}>
        {/* recessive gridlines */}
        {[0.5, 1].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-stone-100" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 left-0 bg-white pr-1 text-[10px] leading-none text-stone-400">{Math.round(max * f)}</span>
          </div>
        ))}
        {bars.map((b, i) => (
          <div
            key={b.key}
            className="relative flex h-full flex-1 cursor-default items-end justify-center"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={0}
            aria-label={`${b.hint ?? b.label}: ${b.value} ${unit}${b.value === 1 ? "" : "s"}`}
          >
            <div
              className="w-full max-w-10 rounded-t transition-opacity"
              style={{ height: `${(b.value / max) * 100}%`, minHeight: b.value ? 3 : 0, background: MARK, opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
            {i === peak && b.value > 0 && hover === null && (
              <span className="absolute text-xs font-medium text-stone-700" style={{ bottom: `calc(${(b.value / max) * 100}% + 4px)` }}>{b.value}</span>
            )}
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md bg-[#151B1F] px-2.5 py-1.5 text-xs text-white shadow-lg">
                <span className="block text-stone-300">{b.hint ?? b.label}</span>
                <span className="font-semibold">{b.value}</span> {unit}{b.value === 1 ? "" : "s"}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {bars.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center text-[11px] text-stone-500">{i % step === 0 ? b.label : ""}</span>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars with the value written at the end of each bar. */
export function Ranked({ bars, total, empty = "No bookings in this period.", limit = 10 }: { bars: Bar[]; total?: number; empty?: string; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  if (bars.length === 0) return <p className="py-8 text-center text-sm text-stone-500">{empty}</p>;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const shown = showAll ? bars : bars.slice(0, limit);
  return (
    <div>
      <ul className="space-y-2.5">
        {shown.map((b) => (
          <li key={b.key} title={`${b.label}: ${b.value}${total ? ` (${Math.round((b.value / total) * 100)}%)` : ""}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-stone-800">{b.label}</span>
              <span className="shrink-0 tabular-nums text-stone-600">
                {b.value}
                {total ? <span className="ml-1 text-xs text-stone-400">{Math.round((b.value / total) * 100)}%</span> : null}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-stone-100">
              <div className="h-2 rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: MARK }} />
            </div>
          </li>
        ))}
      </ul>
      {bars.length > limit && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 text-sm font-medium text-stone-600 hover:text-stone-900">
          {showAll ? "Show fewer" : `Show all ${bars.length}`}
        </button>
      )}
    </div>
  );
}
