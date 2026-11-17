"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BookerEventType } from "@/lib/booker-props";
import TimezonePicker, { canonicalTz } from "./TimezonePicker";

type Spot = { start: string; remaining: number | null };
type Day = { date: string; status: "available" | "unavailable"; spots: Spot[] };

interface Props {
  eventType: BookerEventType;
  businessName: string;
  ownerName: string;
  linkToken?: string;
  reschedule?: { token: string; name: string; email: string; currentStartLabel: string };
}

const REMEMBER_KEY = "hb_client";

function detectTz() {
  try {
    return canonicalTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Melbourne");
  } catch {
    return "Australia/Melbourne";
  }
}

function readSaved(): { name?: string; email?: string; phone?: string } | null {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Renders client-side only (see BookerClient), so browser APIs are safe in state initialisers. */
/** The same free times laid out by day in another timezone (for an instant timezone switch). */
function regroupDays(days: Day[], tz: string, month: DateTime<boolean>): Day[] {
  const byDate = new Map<string, Spot[]>();
  for (const d of days) {
    for (const spot of d.spots) {
      const date = DateTime.fromISO(spot.start).setZone(tz).toISODate()!;
      byDate.set(date, [...(byDate.get(date) ?? []), spot]);
    }
  }
  const out: Day[] = [];
  for (let d = month.startOf("month"); d.month === month.month; d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    const spots = (byDate.get(date) ?? []).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    out.push({ date, status: spots.length ? "available" : "unavailable", spots });
  }
  return out;
}

export default function Booker({ eventType: et, businessName, ownerName, linkToken, reschedule }: Props) {
  const router = useRouter();
  const [tz, setTz] = useState<string>(() => (et.lockTimezone ? et.scheduleTimezone : detectTz()));
  const [month, setMonth] = useState<DateTime<boolean>>(() => DateTime.now().startOf("month"));
  const [reloadNonce, setReloadNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; base: string; days: Day[]; nextAvailable: string | null; error: string | null } | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [hour12, setHour12] = useState(true);
  const autoJumped = useRef(false);

  // Client details (returning clients are prefilled from this device)
  const [name, setName] = useState(() => reschedule?.name ?? readSaved()?.name ?? "");
  const [email, setEmail] = useState(() => reschedule?.email ?? readSaved()?.email ?? "");
  const [phone, setPhone] = useState(() => (reschedule ? "" : readSaved()?.phone ?? ""));
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [checklist, setChecklist] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromIso = month.toISODate()!;
  const toIso = month.endOf("month").toISODate()!;
  const base = `${et.slug}|${fromIso}|${reloadNonce}`;
  const key = `${base}|${tz}`;

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ slug: et.slug, from: fromIso, to: toIso, tz });
    if (reschedule) qs.set("reschedule", reschedule.token);
    // The page starts this exact request before the app's code loads (see app/[slug]/page.tsx);
    // reuse that answer for the first look (not after a refresh, and not if it's old).
    const w = window as unknown as { __hbAvail?: { qs: string; at: number; data: Promise<{ ok: boolean; body: { error?: string } }> } };
    const early = w.__hbAvail && w.__hbAvail.qs === qs.toString() && reloadNonce === 0 && Date.now() - w.__hbAvail.at < 30_000 ? w.__hbAvail.data : null;
    (early ?? fetch(`/api/availability?${qs}`, { cache: "no-store" }).then(async (res) => ({ ok: res.ok, body: await res.json() })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Couldn't load times");
        return body as unknown as { days: Day[]; nextAvailable: string | null };
      })
      .then((data) => {
        if (cancelled) return;
        // Like Calendly: open on the first bookable month instead of an empty one.
        if (!autoJumped.current && data.nextAvailable && !data.days.some((d) => d.status === "available")) {
          autoJumped.current = true;
          setMonth(DateTime.fromISO(data.nextAvailable).startOf("month"));
          return;
        }
        autoJumped.current = true;
        setResult({ key, base, days: data.days, nextAvailable: data.nextAvailable, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setResult({ key, base, days: [], nextAvailable: null, error: e instanceof Error ? e.message : "Couldn't load times" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, base, et.slug, fromIso, toIso, tz, reschedule, reloadNonce]);

  // Changing timezone only moves the same free times between days, so re-sort what is already
  // loaded straight away and let the fresh server answer replace it quietly when it arrives.
  const regrouped = result && result.key !== key && result.base === base && !result.error;
  const loading = result?.key !== key && !regrouped;
  const days = useMemo(() => {
    if (!result || loading) return [];
    if (result.key === key) return result.days;
    return regroupDays(result.days, tz, month);
  }, [loading, result, key, tz, month]);
  const nextAvailable = loading ? null : result?.nextAvailable ?? null;
  const loadError = loading ? null : result?.error ?? null;
  const dayMap = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const selectedDate =
    pickedDate && dayMap.get(pickedDate)?.status === "available" ? pickedDate : days.find((d) => d.status === "available")?.date ?? null;
  const spots = selectedDate ? dayMap.get(selectedDate)?.spots ?? [] : [];
  const today = DateTime.now().setZone(tz).startOf("day");

  // Monday-first month grid
  const grid = useMemo(() => {
    const start = month.startOf("month");
    const lead = (start.weekday + 6) % 7;
    const cells: (DateTime | null)[] = Array.from({ length: lead }, () => null);
    for (let d = start; d.month === month.month; d = d.plus({ days: 1 })) cells.push(d);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);

  const fmtTime = (iso: string) => DateTime.fromISO(iso, { zone: tz }).toFormat(hour12 ? "h:mm a" : "HH:mm");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSpot) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      slug: et.slug,
      start: selectedSpot.start,
      timezone: tz,
      name,
      email,
      phone,
      notes,
      guests: guests.split(/[\s,;]+/).map((g) => g.trim()).filter(Boolean),
      answers,
      consents,
      checklist,
      linkToken,
      rescheduleToken: reschedule?.token,
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    for (const [key, list] of Object.entries(files)) for (const f of list) fd.append(`file:${key}`, f);
    try {
      const res = await fetch("/api/bookings", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        if (res.status === 409) {
          setSelectedSpot(null);
          setReloadNonce((n) => n + 1);
        }
        return;
      }
      if (!reschedule) {
        try {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name, email, phone }));
        } catch {}
      }
      router.push(`/booking/${data.manageToken}?${reschedule ? "rescheduled" : "new"}=1`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <div className="min-w-0 border-b border-stone-200 p-6 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/avatar.png" alt="" className="h-8 w-8 rounded-full object-cover" />
        <p className="text-sm text-stone-500">{businessName}</p>
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{et.title}</h1>
      <ul className="mt-3 space-y-1 text-sm text-stone-600">
        <li>⏱ {et.durationMinutes} min</li>
        <li>📍 {et.locationLabel}</li>
        {et.seats && <li>👥 Group session · up to {et.seats}</li>}
      </ul>
      {reschedule && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Rescheduling your appointment currently on <strong>{reschedule.currentStartLabel}</strong>.
        </p>
      )}
      {!reschedule && et.descriptionHtml && (
        <div className="prose-desc mt-5 max-h-[28rem] overflow-y-auto pr-2 text-sm text-stone-700" dangerouslySetInnerHTML={{ __html: et.descriptionHtml }} />
      )}
    </div>
  );

  // Step 2: details form (or reschedule confirmation)
  if (selectedSpot) {
    const startLabel = DateTime.fromISO(selectedSpot.start, { zone: tz }).toFormat(`cccc d LLLL yyyy, ${hour12 ? "h:mm a" : "HH:mm"}`);
    return (
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {header}
        <form onSubmit={submit} className="min-w-0 space-y-5 p-6">
          <div className="rounded-lg bg-stone-100 p-3 text-sm">
            <div className="font-medium">{startLabel}</div>
            <div className="text-stone-600">{tz.replace(/_/g, " ")} · {et.durationMinutes} min</div>
            <button type="button" className="mt-1 text-[var(--brand)] underline underline-offset-2" onClick={() => setSelectedSpot(null)}>
              Change time
            </button>
          </div>

          {!reschedule && (
            <>
              <Field label="Your name" required>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
              <Field label="Email" required>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              {et.collectPhone !== "hidden" && (
                <Field label="Phone number" required={et.collectPhone === "required"}>
                  <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required={et.collectPhone === "required"} autoComplete="tel" />
                </Field>
              )}

              {et.questions.map((q) => (
                <Field key={q.key} label={q.label} required={q.required} group={q.type === "multiselect" || q.type === "file"}>
                  {q.type === "textarea" ? (
                    <textarea className="input min-h-24" value={(answers[q.key] as string) ?? ""} required={q.required} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                  ) : q.type === "select" ? (
                    <select className="input" value={(answers[q.key] as string) ?? ""} required={q.required} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}>
                      <option value="">Choose…</option>
                      {q.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : q.type === "multiselect" ? (
                    <div className="space-y-1.5">
                      {q.options.map((o) => {
                        const cur = (answers[q.key] as string[]) ?? [];
                        return (
                          <label key={o} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={cur.includes(o)} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.checked ? [...cur, o] : cur.filter((x) => x !== o) })} />
                            {o}
                          </label>
                        );
                      })}
                    </div>
                  ) : q.type === "file" ? (
                    <div>
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                        required={q.required}
                        onChange={(e) => setFiles({ ...files, [q.key]: Array.from(e.target.files ?? []) })}
                        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-2"
                      />
                      <p className="mt-1 text-xs text-stone-500">PDF or photos, up to 10 MB each. Only {ownerName} can see these.</p>
                    </div>
                  ) : (
                    <input className="input" type={q.type === "phone" ? "tel" : "text"} value={(answers[q.key] as string) ?? ""} required={q.required} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                  )}
                </Field>
              ))}

              {et.showNotes && (
                <Field label="Anything else I should know?">
                  <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              )}
              {et.allowGuests && (
                <Field label="Add guests (emails, optional)">
                  <input className="input" value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="name@example.com, …" />
                </Field>
              )}

              {et.checklist.length > 0 && (
                <fieldset className="space-y-2 rounded-lg border border-stone-200 p-4">
                  <legend className="px-1 text-sm font-medium">Before you book</legend>
                  {et.checklist.map((item) => (
                    <label key={item} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5" required checked={checklist.includes(item)} onChange={(e) => setChecklist(e.target.checked ? [...checklist, item] : checklist.filter((x) => x !== item))} />
                      {item}
                    </label>
                  ))}
                </fieldset>
              )}

              {et.consents.length > 0 && (
                <div className="space-y-2">
                  {et.consents.map((c) => (
                    <label key={c.key} className="flex items-start gap-2 text-sm text-stone-700">
                      <input type="checkbox" className="mt-0.5" required={c.required} checked={Boolean(consents[c.key])} onChange={(e) => setConsents({ ...consents, [c.key]: e.target.checked })} />
                      <span>
                        {c.label}
                        {c.required && <span className="text-red-600"> *</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {error && <p className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-brand ring-brand w-full rounded-lg px-4 py-3 font-medium">
            {submitting ? "Booking…" : reschedule ? "Confirm new time" : "Confirm booking"}
          </button>
        </form>
      </div>
    );
  }

  // Step 1: calendar + times
  return (
    <div className="grid grid-cols-1 overflow-visible rounded-2xl border border-stone-200 bg-white shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,4fr)]">
      {header}
      <div className="flex min-w-0 flex-col sm:flex-row">
      <div className="min-w-0 flex-1 p-6">
        <h2 className="mb-4 text-lg font-semibold">Select a date &amp; time</h2>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{month.toFormat("LLLL yyyy")}</h3>
          <div className="flex gap-1">
            <button aria-label="Previous month" className="rounded-md px-2.5 py-1 hover:bg-stone-100 disabled:opacity-30" disabled={month <= DateTime.now().startOf("month")} onClick={() => setMonth(month.minus({ months: 1 }))}>
              ‹
            </button>
            <button aria-label="Next month" className="rounded-md px-2.5 py-1 hover:bg-stone-100" onClick={() => setMonth(month.plus({ months: 1 }))}>
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`}>
          {grid.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = d.toISODate()!;
            const available = dayMap.get(iso)?.status === "available";
            const selected = iso === selectedDate;
            return (
              <button
                key={iso}
                disabled={!available}
                onClick={() => setPickedDate(iso)}
                aria-pressed={selected}
                aria-label={`${d.toFormat("cccc d LLLL")}${available ? ", available" : ", unavailable"}`}
                className={`ring-brand aspect-square rounded-lg text-sm transition ${
                  selected ? "btn-brand font-semibold" : available ? "bg-[color-mix(in_srgb,var(--brand)_12%,white)] font-semibold text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_22%,white)]" : "text-stone-300"
                } ${d.hasSame(today, "day") ? "underline underline-offset-4" : ""}`}
              >
                {d.day}
              </button>
            );
          })}
        </div>

        {loadError && <p className="mt-4 text-sm text-red-700">{loadError}</p>}
        {!loading && !loadError && !days.some((d) => d.status === "available") && (
          <div className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
            No times this month.{" "}
            {nextAvailable ? (
              <button className="text-[var(--brand)] underline underline-offset-2" onClick={() => setMonth(DateTime.fromISO(nextAvailable).startOf("month"))}>
                Jump to the next available date ({DateTime.fromISO(nextAvailable).toFormat("d LLL")})
              </button>
            ) : (
              "There are no upcoming times for this booking type."
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="shrink-0 text-stone-500">Time zone</span>
          <TimezonePicker value={tz} onChange={setTz} hour12={hour12} onHour12Change={setHour12} disabled={et.lockTimezone} />
        </div>

      </div>

      <div className="border-t border-stone-200 p-6 sm:w-60 sm:shrink-0 sm:border-l sm:border-t-0 sm:px-4 lg:w-64">
        {selectedDate && spots.length > 0 ? (
          <>
            <h3 className="mb-4 font-medium sm:mt-11">{DateTime.fromISO(selectedDate).toFormat("cccc, d LLLL")}</h3>
            <div className="grid grid-cols-2 gap-2 sm:max-h-[26rem] sm:grid-cols-1 sm:overflow-y-auto sm:pr-1">
              {spots.map((s) => (
                <button key={s.start} onClick={() => setSelectedSpot(s)} className="ring-brand rounded-lg border-2 border-[var(--brand)] px-3 py-3 text-center text-sm font-semibold text-[color-mix(in_srgb,var(--brand)_55%,black)] transition hover:bg-[color-mix(in_srgb,var(--brand)_12%,white)]">
                  {fmtTime(s.start)}
                  {s.remaining !== null && <span className="block text-xs font-normal text-stone-500">{s.remaining} {s.remaining === 1 ? "spot" : "spots"} left</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-500 sm:mt-11">{loading ? "Loading times…" : "Pick a day to see the times."}</p>
        )}
      </div>
      </div>
    </div>
  );
}

function Field({ label, required, group, children }: { label: string; required?: boolean; group?: boolean; children: React.ReactNode }) {
  const text = (
    <span className="mb-1 block text-sm font-medium text-stone-800">
      {label}
      {required && <span className="text-red-600"> *</span>}
    </span>
  );
  // Groups (checkbox lists, file inputs) can't sit inside a <label>.
  return group ? (
    <div role="group" aria-label={label}>
      {text}
      {children}
    </div>
  ) : (
    <label className="block">
      {text}
      {children}
    </label>
  );
}
