"use client";

import { DateTime } from "luxon";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Calendly-style timezone picker: a short, grouped list of friendly names (one entry per
 * real-world zone people recognise), a search box, an am/pm–24h switch and the current local
 * time beside each zone. Searching also reaches every other IANA zone.
 */
const GROUPS: { region: string; zones: [string, string][] }[] = [
  {
    region: "Australia",
    zones: [
      ["Australia/Melbourne", "Sydney, Melbourne Time"],
      ["Australia/Brisbane", "Brisbane Time"],
      ["Australia/Adelaide", "Adelaide Time"],
      ["Australia/Darwin", "Darwin Time"],
      ["Australia/Perth", "Perth Time"],
      ["Australia/Hobart", "Hobart Time"],
      ["Australia/Lord_Howe", "Lord Howe Island Time"],
    ],
  },
  {
    region: "Pacific",
    zones: [
      ["Pacific/Auckland", "New Zealand Time"],
      ["Pacific/Fiji", "Fiji Time"],
      ["Pacific/Port_Moresby", "Papua New Guinea Time"],
      ["Pacific/Guam", "Guam Time"],
      ["Pacific/Honolulu", "Hawaii Time"],
      ["Pacific/Tongatapu", "Tonga Time"],
      ["Pacific/Apia", "Samoa Time"],
    ],
  },
  {
    region: "Asia",
    zones: [
      ["Asia/Tokyo", "Japan, Korea Time"],
      ["Asia/Shanghai", "China, Hong Kong, Taiwan Time"],
      ["Asia/Singapore", "Singapore, Malaysia, Philippines Time"],
      ["Asia/Jakarta", "Jakarta, Bangkok, Hanoi Time"],
      ["Asia/Kolkata", "India, Sri Lanka Time"],
      ["Asia/Kathmandu", "Nepal Time"],
      ["Asia/Dhaka", "Bangladesh Time"],
      ["Asia/Karachi", "Pakistan Time"],
      ["Asia/Dubai", "Dubai, Abu Dhabi, Oman Time"],
      ["Asia/Riyadh", "Saudi Arabia, Qatar, Kuwait Time"],
      ["Asia/Tehran", "Iran Time"],
      ["Asia/Jerusalem", "Israel Time"],
      ["Asia/Beirut", "Lebanon Time"],
    ],
  },
  {
    region: "Europe",
    zones: [
      ["Europe/London", "UK, Ireland, Lisbon Time"],
      ["Europe/Paris", "Central European Time"],
      ["Europe/Athens", "Eastern European Time"],
      ["Europe/Istanbul", "Turkey Time"],
      ["Europe/Moscow", "Moscow Time"],
    ],
  },
  {
    region: "Africa",
    zones: [
      ["Africa/Johannesburg", "South Africa Time"],
      ["Africa/Cairo", "Egypt Time"],
      ["Africa/Lagos", "West Africa Time"],
      ["Africa/Nairobi", "East Africa Time"],
      ["Africa/Casablanca", "Morocco Time"],
    ],
  },
  {
    region: "US / Canada",
    zones: [
      ["America/New_York", "Eastern Time"],
      ["America/Chicago", "Central Time"],
      ["America/Denver", "Mountain Time"],
      ["America/Phoenix", "Arizona Time"],
      ["America/Los_Angeles", "Pacific Time"],
      ["America/Anchorage", "Alaska Time"],
      ["America/Halifax", "Atlantic Time"],
      ["America/St_Johns", "Newfoundland Time"],
    ],
  },
  {
    region: "Central & South America",
    zones: [
      ["America/Mexico_City", "Mexico City Time"],
      ["America/Bogota", "Colombia, Peru, Ecuador Time"],
      ["America/Caracas", "Venezuela Time"],
      ["America/Santiago", "Chile Time"],
      ["America/Sao_Paulo", "Brazil (Brasília) Time"],
      ["America/Argentina/Buenos_Aires", "Argentina Time"],
    ],
  },
  { region: "UTC", zones: [["UTC", "UTC Time"]] },
];

const CURATED = new Map(GROUPS.flatMap((g) => g.zones));

/** Zones that always keep the same clock as a listed one, so they share its entry. */
const SAME_AS: Record<string, string> = {
  "Australia/Sydney": "Australia/Melbourne",
  "Australia/Canberra": "Australia/Melbourne",
  "Australia/ACT": "Australia/Melbourne",
  "Australia/NSW": "Australia/Melbourne",
  "Australia/Victoria": "Australia/Melbourne",
  "Australia/Queensland": "Australia/Brisbane",
  "Australia/Lindeman": "Australia/Brisbane",
  "Australia/West": "Australia/Perth",
  "Australia/Tasmania": "Australia/Hobart",
  "Australia/South": "Australia/Adelaide",
  "Pacific/Chatham": "Pacific/Chatham",
  "Asia/Seoul": "Asia/Tokyo",
  "Asia/Hong_Kong": "Asia/Shanghai",
  "Asia/Taipei": "Asia/Shanghai",
  "Asia/Macau": "Asia/Shanghai",
  "Asia/Kuala_Lumpur": "Asia/Singapore",
  "Asia/Manila": "Asia/Singapore",
  "Asia/Bangkok": "Asia/Jakarta",
  "Asia/Ho_Chi_Minh": "Asia/Jakarta",
  "Asia/Saigon": "Asia/Jakarta",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Colombo": "Asia/Kolkata",
  "Asia/Muscat": "Asia/Dubai",
  "Asia/Qatar": "Asia/Riyadh",
  "Asia/Kuwait": "Asia/Riyadh",
  "Asia/Bahrain": "Asia/Riyadh",
  "Asia/Tel_Aviv": "Asia/Jerusalem",
  "Europe/Dublin": "Europe/London",
  "Europe/Lisbon": "Europe/London",
  "Europe/Berlin": "Europe/Paris",
  "Europe/Madrid": "Europe/Paris",
  "Europe/Rome": "Europe/Paris",
  "Europe/Amsterdam": "Europe/Paris",
  "Europe/Brussels": "Europe/Paris",
  "Europe/Vienna": "Europe/Paris",
  "Europe/Zurich": "Europe/Paris",
  "Europe/Stockholm": "Europe/Paris",
  "Europe/Oslo": "Europe/Paris",
  "Europe/Copenhagen": "Europe/Paris",
  "Europe/Prague": "Europe/Paris",
  "Europe/Warsaw": "Europe/Paris",
  "Europe/Budapest": "Europe/Paris",
  "Europe/Belgrade": "Europe/Paris",
  "Europe/Helsinki": "Europe/Athens",
  "Europe/Kiev": "Europe/Athens",
  "Europe/Kyiv": "Europe/Athens",
  "Europe/Bucharest": "Europe/Athens",
  "Europe/Sofia": "Europe/Athens",
  "America/Toronto": "America/New_York",
  "America/Detroit": "America/New_York",
  "America/Montreal": "America/New_York",
  "America/Winnipeg": "America/Chicago",
  "America/Edmonton": "America/Denver",
  "America/Boise": "America/Denver",
  "America/Vancouver": "America/Los_Angeles",
  "America/Tijuana": "America/Los_Angeles",
  "America/Lima": "America/Bogota",
  "America/Guayaquil": "America/Bogota",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
};

/** The listed zone a visitor's detected zone shares a clock with (or the zone itself). */
export function canonicalTz(zone: string) {
  const c = SAME_AS[zone];
  return c && CURATED.has(c) ? c : zone;
}

/** Friendly name for any zone: curated name, else "City (Region)". */
export function tzLabel(zone: string) {
  const known = CURATED.get(zone);
  if (known) return known;
  const parts = zone.split("/");
  const city = parts.at(-1)!.replace(/_/g, " ");
  return parts.length > 1 ? `${city} (${parts[0].replace(/_/g, " ")})` : city;
}

function allZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return [...CURATED.keys()];
  }
}

export default function TimezonePicker({
  value,
  onChange,
  hour12,
  onHour12Change,
  disabled,
}: {
  value: string;
  onChange: (zone: string) => void;
  hour12: boolean;
  onHour12Change: (v: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => DateTime.now());
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const tick = setInterval(() => setNow(DateTime.now()), 30_000);
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      clearInterval(tick);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The visitor's own zone always appears, even when it isn't in the short list.
    const base = GROUPS.map((g) => ({ ...g, zones: [...g.zones] }));
    if (!CURATED.has(value)) base.unshift({ region: "Your timezone", zones: [[value, tzLabel(value)]] });
    if (!q) return base;
    const hit = (zone: string, label: string, region: string) => `${zone} ${label} ${region}`.toLowerCase().replace(/_/g, " ").includes(q);
    const filtered = base.map((g) => ({ ...g, zones: g.zones.filter(([z, l]) => hit(z, l, g.region)) })).filter((g) => g.zones.length);
    const shown = new Set(filtered.flatMap((g) => g.zones.map(([z]) => z)));
    const more = allZones()
      .filter((z) => !shown.has(z) && hit(z, tzLabel(z), ""))
      .slice(0, 30)
      .map((z) => [z, tzLabel(z)] as [string, string]);
    return more.length ? [...filtered, { region: "More timezones", zones: more }] : filtered;
  }, [query, value]);

  const timeIn = (zone: string) => now.setZone(zone).toFormat(hour12 ? "h:mma" : "HH:mm").toLowerCase();

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setNow(DateTime.now());
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-stone-700 hover:bg-stone-100 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="truncate">{tzLabel(value)} ({timeIn(value)})</span>
        {!disabled && <span className="text-xs text-stone-400">▾</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
          <div className="border-b border-stone-100 p-3">
            <label className="flex items-center gap-2 rounded-lg px-3 py-2 ring-2 ring-[var(--brand)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by city or country…"
                className="w-full bg-transparent text-sm outline-none"
                aria-label="Search timezones"
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-800">Time zone</span>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-600">
                am/pm
                <input type="checkbox" className="peer sr-only" checked={!hour12} onChange={(e) => onHour12Change(!e.target.checked)} aria-label="Use 24-hour time" />
                <span className="relative h-5 w-9 rounded-full bg-stone-300 transition peer-checked:bg-stone-700 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
                24h
              </label>
            </div>
          </div>
          <ul role="listbox" aria-label="Timezones" className="overflow-y-auto py-1">
            {groups.length === 0 && <li className="px-4 py-6 text-center text-sm text-stone-500">No timezone matches “{query}”.</li>}
            {groups.map((g) => (
              <li key={g.region}>
                <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-stone-800">{g.region}</p>
                <ul>
                  {g.zones.map(([zone, label]) => (
                    <li key={zone}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={zone === value}
                        onClick={() => {
                          onChange(zone);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-stone-100 ${zone === value ? "bg-[color-mix(in_srgb,var(--brand)_18%,white)] font-medium" : ""}`}
                      >
                        <span className="min-w-0">{label}</span>
                        <span className="shrink-0 tabular-nums text-stone-600">{timeIn(zone)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
