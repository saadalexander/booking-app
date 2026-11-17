"use client";

import { useActionState, useState } from "react";
import HoursEditor, { type Hours } from "@/components/HoursEditor";
import { saveSchedule } from "../../../actions";

export default function ScheduleForm({ id, initial }: { id: string; initial: { name: string } & Hours }) {
  const [state, action, pending] = useActionState(saveSchedule, undefined);
  const [name, setName] = useState(initial.name);
  const [hours, setHours] = useState<Hours>({ timezone: initial.timezone, rules: initial.rules, overrides: initial.overrides });

  return (
    <form action={action} className="mt-6 space-y-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify({ name, ...hours })} />
      <div className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <label className="block max-w-sm">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
      </div>
      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <HoursEditor value={hours} onChange={setHours} />
      </section>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-brand rounded-lg px-5 py-2.5 font-medium">{pending ? "Saving…" : "Save"}</button>
        {state?.ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
        {state?.error && <span className="whitespace-pre-line text-sm text-red-700" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}
