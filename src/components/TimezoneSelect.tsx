"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** A plain dropdown of every IANA timezone, grouped by region. Empty value → the browser's own zone. */
export default function TimezoneSelect({ name, defaultValue, className = "input" }: { name: string; defaultValue?: string; className?: string }) {
  const [chosen, setValue] = useState(defaultValue ?? "");
  // Before a choice: the visitor's own zone (empty while rendering on the server).
  const fallback = useSyncExternalStore(noSubscribe, browserZone, () => "");
  const value = chosen || fallback;
  const groups = useMemo(() => {
    let zones: string[];
    try {
      zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
    } catch {
      zones = [];
    }
    if (value && !zones.includes(value)) zones = [value, ...zones];
    const g = new Map<string, string[]>();
    for (const z of zones) {
      const region = z.includes("/") ? z.split("/")[0] : "Other";
      g.set(region, [...(g.get(region) ?? []), z]);
    }
    return [...g.entries()];
  }, [value]);
  return (
    <select name={name} className={className} value={value} onChange={(e) => setValue(e.target.value)} required>
      {!value && <option value="">Choose your timezone…</option>}
      {groups.map(([region, zones]) => (
        <optgroup key={region} label={region}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.split("/").slice(1).join(" / ").replace(/_/g, " ") || z}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
