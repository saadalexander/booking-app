"use client";

import { useActionState, useRef, useState } from "react";
import { render, sampleVariables, TRIGGERS, VARIABLES, type Trigger } from "@/lib/workflow-text";
import { saveWorkflow } from "../../../workflow-actions";

export interface WorkflowValues {
  id: string;
  name: string;
  active: boolean;
  trigger: Trigger;
  offsetMinutes: number;
  recipient: "client" | "owner";
  subject: string;
  body: string;
  eventTypeIds: string[];
}

function splitOffset(m: number): [number, number] {
  if (m > 0 && m % 1440 === 0) return [m / 1440, 1440];
  if (m > 0 && m % 60 === 0) return [m / 60, 60];
  return [m, 1];
}

export default function WorkflowForm({
  values: v,
  groups,
  owner,
}: {
  values: WorkflowValues;
  groups: { name: string; types: { id: string; title: string }[] }[];
  owner: { ownerName: string; businessName: string; ownerEmail: string; baseUrl?: string };
}) {
  const [state, action, pending] = useActionState(saveWorkflow, undefined);
  const [trigger, setTrigger] = useState<Trigger>(v.trigger);
  const [scope, setScope] = useState(v.eventTypeIds.length ? "some" : "all");
  const [subject, setSubject] = useState(v.subject);
  const [body, setBody] = useState(v.body);
  const [recipient, setRecipient] = useState(v.recipient);
  const [amount, unit] = splitOffset(v.offsetMinutes);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<"subject" | "body">("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const timed = trigger === "before_start" || trigger === "after_end";
  const vars = sampleVariables(owner);

  function insert(key: string) {
    const token = `{${key}}`;
    const el = lastFocus.current === "subject" ? subjectRef.current : bodyRef.current;
    const set = lastFocus.current === "subject" ? setSubject : setBody;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    set(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="id" value={v.id} />
      <div className="space-y-5">
        <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">When</h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input name="name" className="input" defaultValue={v.name} required placeholder="e.g. Reminder 24 hours before" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Send it</span>
            <select name="trigger" className="input" value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}>
              {Object.entries(TRIGGERS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {timed && (
            <div className="grid grid-cols-[8rem_1fr] items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">How long {trigger === "before_start" ? "before" : "after"}</span>
                <input name="offsetAmount" type="number" min={0} step="any" className="input" defaultValue={amount} required />
              </label>
              <select name="offsetUnit" className="input" defaultValue={String(unit)} aria-label="Unit">
                <option value="1">minutes</option>
                <option value="60">hours</option>
                <option value="1440">days</option>
              </select>
            </div>
          )}
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">Send to</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="recipient" value="client" checked={recipient === "client"} onChange={() => setRecipient("client")} className="accent-[var(--brand)]" /> The client</label>
              <label className="flex items-center gap-2"><input type="radio" name="recipient" value="owner" checked={recipient === "owner"} onChange={() => setRecipient("owner")} className="accent-[var(--brand)]" /> Me ({owner.ownerEmail})</label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">For</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} className="accent-[var(--brand)]" /> All booking types</label>
              <label className="flex items-center gap-2"><input type="radio" name="scope" value="some" checked={scope === "some"} onChange={() => setScope("some")} className="accent-[var(--brand)]" /> Only some</label>
            </div>
            {scope === "some" && (
              <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-lg bg-stone-50 p-3">
                {groups.map((g) => (
                  <div key={g.name}>
                    <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{g.name}</p>
                    {g.types.map((t) => (
                      <label key={t.id} className="mt-1 flex items-start gap-2 text-sm">
                        <input type="checkbox" name="eventTypeIds" value={t.id} defaultChecked={v.eventTypeIds.includes(t.id)} className="mt-1 accent-[var(--brand)]" />
                        {t.title}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={v.active} className="accent-[var(--brand)]" /> On (sends automatically)
          </label>
        </section>

        <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">Email</h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Subject</span>
            <input ref={subjectRef} name="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => (lastFocus.current = "subject")} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Message</span>
            <textarea ref={bodyRef} name="body" className="input min-h-64 text-sm" value={body} onChange={(e) => setBody(e.target.value)} onFocus={() => (lastFocus.current = "body")} required />
          </label>
          <div>
            <p className="mb-2 text-sm font-medium">Insert a detail <span className="font-normal text-stone-500">(click to add where your cursor is)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((x) => (
                <button key={x.key} type="button" onClick={() => insert(x.key)} title={x.label} className="rounded-md bg-stone-100 px-2 py-1 font-mono text-xs text-stone-700 hover:bg-stone-200">
                  {`{${x.key}}`}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-xl bg-white ring-1 ring-stone-200">
          <div className="border-b border-stone-100 px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Preview with example details</p>
            <p className="mt-1 text-sm text-stone-600">To: {recipient === "owner" ? owner.ownerEmail : vars.email}</p>
            <p className="mt-0.5 font-medium">{render(subject, vars) || "—"}</p>
          </div>
          <pre className="whitespace-pre-wrap break-words px-5 py-4 font-sans text-sm leading-relaxed text-stone-800">{render(body, vars)}</pre>
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <button name="intent" value="save" disabled={pending} className="btn-brand rounded-lg px-5 py-2.5 font-medium">{pending ? "Saving…" : "Save automation"}</button>
          <button name="intent" value="test" disabled={pending} className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1 ring-stone-200 hover:ring-stone-400">Send me a test</button>
        </div>
        {state?.ok && <p className="text-sm text-emerald-700">Saved ✓</p>}
        {state?.tested && <p className="text-sm text-emerald-700">Test sent to {state.tested} ✓</p>}
        {state?.error && <p className="whitespace-pre-line text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
