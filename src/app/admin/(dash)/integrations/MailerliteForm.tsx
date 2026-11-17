"use client";

import { useActionState } from "react";
import { saveMailerliteKey } from "../../mailerlite-actions";

export default function MailerliteForm() {
  const [state, action, pending] = useActionState(saveMailerliteKey, undefined);
  return (
    <form action={action} className="mt-3 space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">API key</span>
        <input name="key" type="password" autoComplete="off" className="input font-mono text-sm" placeholder="Paste your MailerLite API key" required />
      </label>
      <p className="text-xs text-stone-500">In MailerLite: Integrations → MailerLite API → Generate new token. It&apos;s stored encrypted.</p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">{pending ? "Checking…" : "Connect MailerLite"}</button>
        {state?.ok && <span className="text-sm text-emerald-700">Connected ✓</span>}
        {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
