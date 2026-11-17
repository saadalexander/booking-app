"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPrivateLinkFor, deleteEventType, duplicateEventType, setEventTypeHidden } from "../../actions";

const I = {
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  dots: "M12 12h.01M19 12h.01M5 12h.01",
  lock: "M5 11h14v11H5zM7 11V7a5 5 0 0 1 10 0v4",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
  tag: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42zM7.5 7.5h.01",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  clip: "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
  wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
};

function Svg({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

const iconBtn = "flex h-9 w-9 items-center justify-center text-stone-600 hover:bg-stone-100 hover:text-stone-900";

export default function EventTypeActions({
  id,
  slug,
  hidden,
  categoryId,
  categories,
  bookingUrl,
  hasBookings,
  onMove,
}: {
  id: string;
  slug: string;
  hidden: boolean;
  categoryId: string | null;
  categories: { id: string; name: string }[];
  bookingUrl: string;
  hasBookings: boolean;
  /** Moves this booking type to a category (null = uncategorised). */
  onMove: (categoryId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<null | "category" | "embed">(null);
  const [toast, setToast] = useState("");
  const [isHidden, setIsHidden] = useState(hidden);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const embed = `<iframe src="${bookingUrl}" style="width:100%;min-height:720px;border:0" title="Book a time"></iframe>`;

  useEffect(() => {
    if (!open && !panel) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPanel(null);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, panel]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }
  async function copy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(msg);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-stone-800 hover:bg-stone-100";

  return (
    <div ref={box} className="relative flex shrink-0 items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-500" title={isHidden ? "Hidden from your booking page" : "Shown on your booking page"}>
        <span className="hidden sm:inline">{isHidden ? "Hidden" : "Shown"}</span>
        <input
          type="checkbox"
          className="peer sr-only"
          checked={!isHidden}
          disabled={pending}
          onChange={(e) => {
            const nextHidden = !e.target.checked;
            setIsHidden(nextHidden);
            start(() => setEventTypeHidden(id, nextHidden));
          }}
          aria-label="Show on booking page"
        />
        <span className="relative h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-[#151B1F] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
      </label>

      <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-200">
        <a href={`/${slug}`} target="_blank" className={iconBtn} title="Open booking page" aria-label="Open booking page">
          <Svg d={I.external} />
        </a>
        <button type="button" onClick={() => copy(bookingUrl, "Link copied")} className={`${iconBtn} border-x border-stone-200`} title="Copy link" aria-label="Copy link">
          <Svg d={I.link} />
        </button>
        <button type="button" onClick={() => { setOpen((o) => !o); setPanel(null); }} className={iconBtn} title="More" aria-label="More actions" aria-expanded={open}>
          <Svg d={I.dots} className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10">
          <button type="button" className={item} onClick={() => start(async () => { const url = await createPrivateLinkFor(id); await copy(url, "Private link created and copied"); setOpen(false); })}>
            <Svg d={I.lock} /> Create and copy private link
          </button>
          <Link href={`/admin/event-types/${id}`} className={item}><Svg d={I.edit} /> Edit</Link>
          <button type="button" className={item} onClick={() => { setPanel("category"); setOpen(false); }}><Svg d={I.tag} /> Move to category…</button>
          <form action={duplicateEventType}>
            <input type="hidden" name="id" value={id} />
            <button className={item}><Svg d={I.copy} /> Duplicate</button>
          </form>
          <button type="button" className={item} onClick={() => { setPanel("embed"); setOpen(false); }}><Svg d={I.code} /> Embed</button>
          <button type="button" className={item} onClick={() => { copy(id, "Link ID copied"); setOpen(false); }}><Svg d={I.clip} /> Copy link ID</button>
          <Link href={`/admin/event-types/${id}/troubleshoot`} className={item}><Svg d={I.wrench} /> Troubleshoot</Link>
          <div className="my-1 border-t border-stone-100" />
          <form
            action={deleteEventType}
            onSubmit={(e) => {
              const msg = hasBookings
                ? "This booking type has bookings, so it will be hidden instead of deleted (history is kept). Continue?"
                : "Delete this booking type? This can't be undone.";
              if (!window.confirm(msg)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <button className={`${item} !text-red-700 hover:!bg-red-50`}><Svg d={I.trash} /> Delete</button>
          </form>
        </div>
      )}

      {panel === "category" && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10" role="menu" aria-label="Move to category">
          <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-stone-500">Move to</p>
          {[...categories, { id: "", name: "Uncategorised" }].map((c) => {
            const current = (categoryId ?? "") === c.id;
            return (
              <button
                key={c.id || "none"}
                type="button"
                role="menuitem"
                disabled={current}
                className={`${item} justify-between disabled:cursor-default disabled:bg-stone-50 disabled:font-medium`}
                onClick={() => {
                  onMove(c.id || null);
                  setPanel(null);
                  flash(`Moved to ${c.name}`);
                }}
              >
                {c.name}
                {current && <span className="text-xs text-stone-500">Current</span>}
              </button>
            );
          })}
        </div>
      )}

      {panel === "embed" && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/10">
          <p className="text-sm font-medium">Embed on your website</p>
          <p className="mt-1 text-xs text-stone-500">Paste this into a custom HTML block on your site.</p>
          <textarea readOnly className="input mt-2 h-24 font-mono text-xs" value={embed} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-brand mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium" onClick={() => copy(embed, "Embed code copied")}>Copy code</button>
        </div>
      )}

      {toast && <span role="status" className="absolute -bottom-9 right-0 z-40 whitespace-nowrap rounded-md bg-[#151B1F] px-3 py-1.5 text-xs text-white shadow">{toast}</span>}
    </div>
  );
}
