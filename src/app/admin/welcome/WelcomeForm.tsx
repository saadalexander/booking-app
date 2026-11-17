"use client";

import { useActionState } from "react";
import TimezoneSelect from "@/components/TimezoneSelect";
import { completeWelcome } from "../setup-actions";

export default function WelcomeForm() {
  const [state, action, pending] = useActionState(completeWelcome, undefined);
  return (
    <form action={action} className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <F label="Business name" hint="Shown at the top of your booking page and in emails.">
        <input name="businessName" className="input" required maxLength={120} placeholder="e.g. Alex Lee Coaching" autoFocus />
      </F>
      <F label="Your first name" hint="Used in emails to clients, e.g. “Alex will see you then”.">
        <input name="ownerName" className="input" required maxLength={80} />
      </F>
      <F label="Your email" hint="Booking notifications go here. Use the Google account you'll connect for your calendar.">
        <input name="ownerEmail" type="email" className="input" required />
      </F>
      <F label="Your timezone" hint="Your working hours are in this timezone. We've picked the one your computer uses.">
        <TimezoneSelect name="timezone" />
      </F>
      <F label="Brand colour" hint="Used for buttons and highlights. Click the box to pick a colour.">
        <input name="brandColor" type="color" className="input h-10 w-24 !p-1" defaultValue="#0f766e" />
      </F>
      <p className="text-xs text-stone-500">
        We&apos;ll also add a “Working hours” schedule (Monday to Friday, 9am to 5pm) that you can change under Availability.
      </p>
      {state?.error && <p className="whitespace-pre-line text-sm text-red-700" role="alert">{state.error}</p>}
      <button disabled={pending} className="btn-brand w-full rounded-lg px-4 py-2.5 font-medium">{pending ? "Saving…" : "Save and open my dashboard"}</button>
    </form>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
