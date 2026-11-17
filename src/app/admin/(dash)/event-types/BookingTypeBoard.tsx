"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveEventType } from "../../actions";
import EventTypeActions from "./EventTypeActions";

export interface Row {
  id: string;
  title: string;
  slug: string;
  hidden: boolean;
  categoryId: string | null;
  durationMinutes: number;
  hoursLabel: string;
  noticeLabel: string;
  seats: number | null;
  bookings: number;
}

interface Group {
  id: string | null;
  name: string;
  description: string;
}

/**
 * Booking types grouped by category. Drag a row (by its handle or anywhere on it) onto another
 * category, or between rows to reorder; or use "Move to category…" in its menu.
 */
export default function BookingTypeBoard({ groups, rows: initial, baseUrl }: { groups: Group[]; rows: Row[]; baseUrl: string }) {
  const [rows, setRows] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ group: string | null; before: string | null } | null>(null);
  const [, start] = useTransition();
  const known = new Set(groups.map((g) => g.id));
  const groupOf = (r: Row) => (r.categoryId && known.has(r.categoryId) ? r.categoryId : null);
  const categories = groups.filter((g) => g.id).map((g) => ({ id: g.id!, name: g.name }));
  const visible = groups.filter((g) => g.id !== null || dragId || rows.some((r) => groupOf(r) === null));

  function move(id: string, group: string | null, before: string | null) {
    if (before === id) return;
    setRows((prev) => {
      const moving = prev.find((r) => r.id === id);
      if (!moving) return prev;
      const rest = prev.filter((r) => r.id !== id);
      const next = { ...moving, categoryId: group };
      let at = before ? rest.findIndex((r) => r.id === before) : -1;
      if (at < 0) {
        const last = rest.map(groupOf).lastIndexOf(group);
        at = last >= 0 ? last + 1 : rest.length;
      }
      rest.splice(at, 0, next);
      return rest;
    });
    start(() => moveEventType(id, group, before));
  }

  function endDrag() {
    setDragId(null);
    setOver(null);
  }

  return (
    <>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Categories">
        {visible.map((g) => (
          <a key={g.id ?? "none"} href={`#cat-${g.id ?? "none"}`} className="rounded-full bg-white px-3 py-1 text-sm text-stone-700 ring-1 ring-stone-200 hover:ring-stone-400">
            {g.name} <span className="text-stone-400">{rows.filter((r) => groupOf(r) === g.id).length}</span>
          </a>
        ))}
      </nav>
      <p className="mt-3 text-xs text-stone-500">Tip: drag a booking type by its ⠿ handle to move it to another category or change its order, or use “Move to category…” in its ⋯ menu.</p>

      {visible.map((g) => {
        const items = rows.filter((r) => groupOf(r) === g.id);
        const isTarget = dragId !== null && over?.group === g.id;
        return (
          <section
            key={g.id ?? "none"}
            id={`cat-${g.id ?? "none"}`}
            className="mt-8 scroll-mt-6"
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over?.group !== g.id || (over.before && !items.some((r) => r.id === over.before))) setOver({ group: g.id, before: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) move(dragId, g.id, over?.group === g.id ? over.before : null);
              endDrag();
            }}
          >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#151B1F] pb-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{g.name}</h2>
                {g.description && <p className="text-sm text-stone-500">{g.description}</p>}
              </div>
              {g.id && (
                <Link href={`/admin/event-types/new?category=${g.id}`} className="text-sm font-medium text-stone-600 hover:text-stone-900">+ Add to this category</Link>
              )}
            </div>
            <ul
              className={`@container overflow-visible rounded-xl bg-white ring-1 transition ${isTarget ? "ring-2 ring-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_4%,white)]" : "ring-stone-200"}`}
            >
              {items.length === 0 && (
                <li className={`px-4 py-6 text-center text-sm ${isTarget ? "text-stone-800" : "text-stone-500"}`}>
                  {dragId ? "Drop here to move it into this category" : "No booking types in this category yet."}
                </li>
              )}
              {items.map((r, i) => {
                const lineBefore = isTarget && over?.before === r.id && dragId !== r.id;
                return (
                  <li
                    key={r.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", r.id);
                      setDragId(r.id);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const box = e.currentTarget.getBoundingClientRect();
                      const before = e.clientY < box.top + box.height / 2 ? r.id : items[i + 1]?.id ?? null;
                      if (over?.group !== g.id || over.before !== before) setOver({ group: g.id, before });
                    }}
                    className={`relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 @5xl:flex-nowrap ${i > 0 ? "border-t border-stone-200" : ""} ${dragId === r.id ? "opacity-40" : ""}`}
                  >
                    {lineBefore && <span className="pointer-events-none absolute inset-x-3 -top-px h-0.5 rounded bg-[var(--brand)]" />}
                    <span className="-ml-1 cursor-grab select-none text-lg leading-none text-stone-400 active:cursor-grabbing" title="Drag to move" aria-hidden>⠿</span>
                    <Link href={`/admin/event-types/${r.id}`} draggable={false} className="min-w-[14rem] flex-1 basis-60">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium hover:underline">{r.title}</span>
                        {r.hidden && <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">Hidden</span>}
                      </span>
                      <span className="block break-all text-xs text-stone-500">/{r.slug}</span>
                    </Link>
                    <span className="order-last flex w-full flex-wrap gap-1.5 pl-5 text-xs text-stone-600 @5xl:order-none @5xl:w-auto @5xl:shrink-0 @5xl:flex-nowrap @5xl:justify-end @5xl:pl-0">
                      <span className="whitespace-nowrap rounded-md bg-stone-100 px-2 py-0.5">⏱ {r.durationMinutes} min</span>
                      <span className="whitespace-nowrap rounded-md bg-stone-100 px-2 py-0.5">{r.hoursLabel}</span>
                      <span className="whitespace-nowrap rounded-md bg-stone-100 px-2 py-0.5">{r.noticeLabel}</span>
                      {r.seats ? <span className="whitespace-nowrap rounded-md bg-stone-100 px-2 py-0.5">{r.seats} seats</span> : null}
                      <span className="whitespace-nowrap rounded-md bg-stone-100 px-2 py-0.5">{r.bookings} booking{r.bookings === 1 ? "" : "s"}</span>
                    </span>
                    <EventTypeActions
                      id={r.id}
                      slug={r.slug}
                      hidden={r.hidden}
                      categoryId={groupOf(r)}
                      categories={categories}
                      bookingUrl={`${baseUrl}/${r.slug}`}
                      hasBookings={r.bookings > 0}
                      onMove={(cat) => move(r.id, cat, null)}
                    />
                  </li>
                );
              })}
              {isTarget && over?.before === null && items.length > 0 && (
                <li className="pointer-events-none relative h-0"><span className="absolute inset-x-3 -top-px h-0.5 rounded bg-[var(--brand)]" /></li>
              )}
            </ul>
          </section>
        );
      })}
    </>
  );
}
