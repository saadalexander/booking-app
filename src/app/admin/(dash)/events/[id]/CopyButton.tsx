"use client";

import { useState } from "react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("Copy this:", text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
      className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200 hover:ring-stone-400"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
