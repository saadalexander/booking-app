"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CancelBooking({ token }: { token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${token}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't cancel");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 font-medium text-stone-700 hover:bg-stone-50">
        Cancel
      </button>
    );
  }
  return (
    <div className="w-full space-y-2 sm:basis-full">
      <textarea className="input min-h-16 text-sm" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button onClick={cancel} disabled={busy} className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-stone-300 px-4 py-2 font-medium">
          Keep it
        </button>
      </div>
    </div>
  );
}
