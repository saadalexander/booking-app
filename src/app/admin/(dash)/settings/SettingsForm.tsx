"use client";

import { useActionState } from "react";
import TimezoneSelect from "@/components/TimezoneSelect";
import { saveSettings } from "../../actions";

interface Values {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  timezone: string;
  brandColor: string;
  tagline: string;
  defaultCancelWindowHours: number;
  sidebarStyle: string;
}

export default function SettingsForm({ values: v }: { values: Values }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  return (
    <form action={action} className="mt-6 space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <F label="Business name"><input name="businessName" className="input" defaultValue={v.businessName} required /></F>
      <F label="Your name (shown to clients)"><input name="ownerName" className="input" defaultValue={v.ownerName} required /></F>
      <F label="Your email (booking notifications)"><input name="ownerEmail" type="email" className="input" defaultValue={v.ownerEmail} required /></F>
      <F label="Tagline"><input name="tagline" className="input" defaultValue={v.tagline} /></F>
      <div className="grid gap-4 sm:grid-cols-3">
        <F label="Your timezone"><TimezoneSelect name="timezone" defaultValue={v.timezone} /></F>
        <F label="Brand colour"><input name="brandColor" type="color" className="input h-10 !p-1" defaultValue={v.brandColor} /></F>
        <F label="Change window (hours)"><input name="defaultCancelWindowHours" type="number" min={0} className="input" defaultValue={v.defaultCancelWindowHours} /></F>
      </div>
      <fieldset>
        <legend className="mb-2 block text-sm font-medium">Dashboard sidebar</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { value: "dark", label: "Dark", bg: "#151B1F", line: "#ffffff40", active: "#ffffff1a" },
            { value: "light", label: "Light grey", bg: "#F4F4F2", line: "#27272c30", active: "#ffffff" },
          ].map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 ring-1 ring-stone-200 has-[:checked]:ring-2 has-[:checked]:ring-[var(--brand)]">
              <input type="radio" name="sidebarStyle" value={o.value} defaultChecked={v.sidebarStyle === o.value} className="accent-[var(--brand)]" />
              <span className="flex h-12 w-16 shrink-0 flex-col gap-1 rounded-md p-1.5 ring-1 ring-stone-200" style={{ background: o.bg }} aria-hidden>
                <span className="h-1.5 w-8 rounded-full" style={{ background: "var(--brand)" }} />
                <span className="h-1.5 w-10 rounded-sm" style={{ background: o.active }} />
                <span className="h-1 w-9 rounded-full" style={{ background: o.line }} />
                <span className="h-1 w-7 rounded-full" style={{ background: o.line }} />
              </span>
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-stone-500">Change window: clients can reschedule or cancel online until this many hours before the start. Each booking type can override it.</p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-brand rounded-lg px-5 py-2.5 font-medium">{pending ? "Saving…" : "Save"}</button>
        {state?.ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
        {state?.error && <span className="whitespace-pre-line text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
