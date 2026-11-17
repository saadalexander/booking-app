import Link from "next/link";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Events" };

export default async function EventsPage({ searchParams }: PageProps<"/admin/events">) {
  const sp = await searchParams;
  const past = sp.tab === "past";
  const now = new Date();
  const settings = await getSettings();
  const events = await prisma.groupEvent.findMany({
    where: past ? { endUtc: { lt: now } } : { endUtc: { gte: now } },
    orderBy: { startUtc: past ? "desc" : "asc" },
    include: { _count: { select: { registrations: { where: { status: "registered" } } } } },
    take: 200,
  });

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="mt-1 text-sm text-stone-500">Workshops, webinars and Q&amp;As on a set date. People register on the event&apos;s own page — no availability to set up.</p>
        </div>
        <Link href="/admin/events/new" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">New event</Link>
      </div>
      <div className="mt-5 flex gap-2">
        {[["upcoming", "Upcoming"], ["past", "Past"]].map(([k, label]) => (
          <Link key={k} href={`/admin/events?tab=${k}`} className={`rounded-full px-3 py-1 text-sm ${(k === "past") === past ? "btn-brand" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>{label}</Link>
        ))}
      </div>
      {events.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
          {past ? "No past events." : "No upcoming events. Create one and share its link."}
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {events.map((e) => {
          const start = DateTime.fromJSDate(e.startUtc, { zone: settings.timezone });
          const full = e.capacity != null && e._count.registrations >= e.capacity;
          return (
            <li key={e.id}>
              <Link href={`/admin/events/${e.id}`} className="flex flex-wrap items-center gap-5 rounded-xl bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-400">
                <span className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-stone-50 py-2 ring-1 ring-stone-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)]">{start.toFormat("LLL")}</span>
                  <span className="font-display text-2xl leading-none">{start.toFormat("d")}</span>
                  <span className="text-[11px] text-stone-500">{start.toFormat("ccc")}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.title}</span>
                    {e.status === "draft" && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">Draft</span>}
                    {e.status === "cancelled" && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">Cancelled</span>}
                    {full && e.status === "published" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Full</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-stone-500">{start.toFormat("h:mm a")} · /e/{e.slug}</span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-xl">{e._count.registrations}{e.capacity ? <span className="text-sm text-stone-400"> / {e.capacity}</span> : null}</span>
                  <span className="text-xs text-stone-500">registered</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
