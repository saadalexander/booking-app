"use client";

import { DateTime } from "luxon";
import { useActionState, useState } from "react";
import { registerForEvent } from "../actions";

export default function RegisterForm({ slug, startIso, endIso, eventTz, googleLink }: { slug: string; startIso: string; endIso: string; eventTz: string; googleLink: string }) {
  const [state, action, pending] = useActionState(registerForEvent, undefined);
  const [tz] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || eventTz;
    } catch {
      return eventTz;
    }
  });
  const start = DateTime.fromISO(startIso).setZone(tz);
  const end = DateTime.fromISO(endIso).setZone(tz);

  if (state?.done) {
    return (
      <div className="rounded-xl bg-white p-6 ring-1 ring-stone-200">
        <p className="font-display text-xl">{state.done.already ? "You're already registered" : "You're in!"}</p>
        <p className="mt-2 text-sm text-stone-600">
          {state.done.already ? "We've emailed your details again to " : "Your confirmation and joining details are on their way to "}
          <strong>{state.done.email}</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={googleLink} target="_blank" className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-stone-200 hover:ring-stone-400">+ Google Calendar</a>
          <a href={`/e/${slug}/calendar.ics`} className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-stone-200 hover:ring-stone-400">+ Apple / Outlook</a>
        </div>
        <p className="mt-4 text-xs text-stone-500">Can&apos;t make it? <a className="underline" href={`/e/r/${state.done.manageToken}`}>Cancel your place</a></p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-stone-200">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="timezone" value={tz} />
      <div>
        <p className="font-display text-lg">Save your seat</p>
        <p className="mt-1 text-sm text-stone-600">
          {start.toFormat("cccc d LLLL")}, {start.toFormat("h:mm a")} – {end.toFormat("h:mm a")} <span className="text-stone-500">({tz.replace(/_/g, " ")})</span>
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Name <span className="text-red-600">*</span></span>
        <input name="name" className="input" required autoComplete="name" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email <span className="text-red-600">*</span></span>
        <input name="email" type="email" className="input" required autoComplete="email" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Phone <span className="font-normal text-stone-500">(optional)</span></span>
        <input name="phone" type="tel" className="input" autoComplete="tel" />
      </label>
      {state?.error && <p className="whitespace-pre-line text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-brand w-full rounded-lg px-4 py-3 font-medium">{pending ? "Registering…" : "Register"}</button>
    </form>
  );
}
