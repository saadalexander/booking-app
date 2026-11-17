"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required autoFocus />
      </label>
      {state?.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button disabled={pending} className="btn-brand w-full rounded-lg px-4 py-2.5 font-medium">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
