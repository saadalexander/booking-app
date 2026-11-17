"use client";

import { useActionState, useState } from "react";
import { timeLabel } from "@/components/HoursEditor";
import { saveEvent } from "../../../event-actions";

export interface EventFormValues {
  id: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  time: string;
  durationMinutes: number;
  timezone: string;
  locationType: string;
  locationDetail: string;
  capacity: number | null;
  status: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export default function EventForm({ values: v }: { values: EventFormValues }) {
  const [state, action, pending] = useActionState(saveEvent, undefined);
  const [slug, setSlug] = useState(v.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(v.id));
  const [location, setLocation] = useState(v.locationType);
  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="id" value={v.id} />
      <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">Event</h2>
        <L label="Title">
          <input name="title" className="input" defaultValue={v.title} required onChange={(e) => !slugTouched && setSlug(slugify(e.target.value))} />
        </L>
        <L label="Link" hint={`Share this: /e/${slug || "your-event"}`}>
          <input name="slug" className="input font-mono" value={slug} required pattern="[a-z0-9][a-z0-9\-]*" onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} onBlur={(e) => setSlug(slugify(e.target.value))} />
        </L>
        <L label="Description" hint="Supports **bold**, _italic_, [links](https://…) and * bullet lists">
          <textarea name="description" className="input min-h-40 text-sm" defaultValue={v.description} />
        </L>
      </section>

      <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">When &amp; where</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <L label="Date"><input name="date" type="date" className="input" defaultValue={v.date} required /></L>
          <L label="Start time">
            <select name="time" className="input" defaultValue={v.time || "18:00"} required>
              {timeOptions(v.time).map((t) => <option key={t} value={t}>{timeLabel(Number(t.slice(0, 2)) * 60 + Number(t.slice(3)))}</option>)}
            </select>
          </L>
          <L label="Length (minutes)"><input name="durationMinutes" type="number" min={5} className="input" defaultValue={v.durationMinutes} required /></L>
        </div>
        <L label="Timezone" hint="The date and time above are in this timezone. Visitors see it in their own.">
          <input name="timezone" className="input" defaultValue={v.timezone} required />
        </L>
        <div className="grid gap-4 sm:grid-cols-2">
          <L label="Location">
            <select name="locationType" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="google_meet">Google Meet (link made for you)</option>
              <option value="online_link">Online (your own link, e.g. Zoom)</option>
              <option value="in_person">In person</option>
            </select>
          </L>
          {location !== "google_meet" && (
            <L label={location === "in_person" ? "Address" : "Joining link"}>
              <input name="locationDetail" className="input" defaultValue={v.locationDetail} placeholder={location === "in_person" ? "Street, suburb" : "https://…"} />
            </L>
          )}
        </div>
        <p className="text-xs text-stone-500">The joining link or address is only sent to people once they register.</p>
      </section>

      <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">Seats &amp; visibility</h2>
        <L label="Seats" hint="Leave empty for unlimited. When it's full, the page says so.">
          <input name="capacity" type="number" min={1} className="input sm:max-w-40" defaultValue={v.capacity ?? ""} />
        </L>
        {v.status !== "cancelled" && (
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="status" value="published" defaultChecked={v.status !== "draft"} className="accent-[var(--brand)]" /> Published — open for registration and shown on your booking page</label>
            <label className="flex items-center gap-2"><input type="radio" name="status" value="draft" defaultChecked={v.status === "draft"} className="accent-[var(--brand)]" /> Draft — hidden</label>
          </fieldset>
        )}
        {v.status === "cancelled" && <input type="hidden" name="status" value="published" />}
      </section>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-brand rounded-lg px-5 py-2.5 font-medium">{pending ? "Saving…" : v.id ? "Save changes" : "Create event"}</button>
        {state?.ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
        {state?.error && <span className="whitespace-pre-line text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

/** "HH:MM" every 15 minutes, plus the event's current time if it's an odd one. */
function timeOptions(current: string) {
  const out: string[] = [];
  for (let m = 0; m < 1440; m += 15) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  if (current && !out.includes(current)) {
    out.push(current);
    out.sort();
  }
  return out;
}
