"use client";

import { useActionState } from "react";
import { cancelMyRegistration } from "../../actions";

export default function CancelForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(cancelMyRegistration, undefined);
  if (state?.done) return <p className="text-sm text-stone-700">Done — your place is cancelled. Thanks for letting us know.</p>;
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-stone-600">Can&apos;t make it? Cancel so someone else can have your seat.</p>
      <button disabled={pending} className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50">
        {pending ? "Cancelling…" : "Cancel my place"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
