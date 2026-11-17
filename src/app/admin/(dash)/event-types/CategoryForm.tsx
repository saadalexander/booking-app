"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveCategory } from "../../actions";

/** Add a category (no id) or rename one (with id). */
export default function CategoryForm({ id = "", name = "", description = "", onDone }: { id?: string; name?: string; description?: string; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveCategory, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (!id) form.current?.reset();
      onDone?.();
    }
  }, [state, id, onDone]);
  return (
    <form ref={form} action={action} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
      <input type="hidden" name="id" value={id} />
      <input name="name" className="input" placeholder="Category name, e.g. Discovery calls" defaultValue={name} required maxLength={80} aria-label="Category name" />
      <input name="description" className="input" placeholder="Short description (optional)" defaultValue={description} maxLength={300} aria-label="Category description" />
      <button className="btn-brand rounded-lg px-4 py-2 text-sm font-medium" disabled={pending}>{id ? "Save" : "Add category"}</button>
      {state?.error && <p className="text-sm text-red-700 sm:col-span-3">{state.error}</p>}
    </form>
  );
}
