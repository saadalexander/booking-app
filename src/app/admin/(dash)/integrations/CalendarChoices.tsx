"use client";

import { useActionState } from "react";
import type { CalendarInfo } from "@/lib/google";
import { saveGoogleCalendars } from "../../actions";

export default function CalendarChoices({ calendars, destination, conflicts }: { calendars: CalendarInfo[]; destination: string; conflicts: string[] }) {
  const [state, action, pending] = useActionState(saveGoogleCalendars, undefined);
  const writable = calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
  return (
    <form action={action} className="mt-3 space-y-5 text-sm">
      <label className="block">
        <span className="mb-1 block font-medium">Add new bookings to</span>
        <select name="destination" className="input max-w-md" defaultValue={destination}>
          {writable.map((c) => (
            <option key={c.id} value={c.id}>{c.summary}{c.primary ? " (main)" : ""}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="mb-1 font-medium">Check these calendars for clashes</legend>
        <p className="mb-2 text-xs text-stone-500">Times that are busy in any ticked calendar can&apos;t be booked.</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {calendars.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" name="conflict" value={c.id} defaultChecked={conflicts.includes(c.id)} />
              <span className="truncate">{c.summary}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-brand rounded-lg px-4 py-2 font-medium">{pending ? "Saving…" : "Save calendars"}</button>
        {state?.ok && <span className="text-emerald-700">Saved ✓</span>}
        {state?.error && <span className="text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
