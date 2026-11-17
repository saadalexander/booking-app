"use client";

import { useState, useTransition } from "react";
import { setBuiltInReminders, setWorkflowActive } from "../../workflow-actions";

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-500">
      <span className="hidden sm:inline">{on ? "On" : "Off"}</span>
      <input type="checkbox" className="peer sr-only" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="relative h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-[#151B1F] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export function WorkflowSwitch({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();
  return (
    <Switch
      on={on}
      disabled={pending}
      label={`Turn “${name}” ${on ? "off" : "on"}`}
      onChange={(v) => {
        setOn(v);
        start(() => setWorkflowActive(id, v));
      }}
    />
  );
}

export function BuiltInSwitch({ on: initial }: { on: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Switch
      on={on}
      disabled={pending}
      label="Built-in reminder emails"
      onChange={(v) => {
        setOn(v);
        start(() => setBuiltInReminders(v));
      }}
    />
  );
}
