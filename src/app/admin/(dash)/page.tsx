import Link from "next/link";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import GettingStarted from "./GettingStarted";

const TABS = { upcoming: "Upcoming", past: "Past", cancelled: "Cancelled" } as const;

export default async function BookingsPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "upcoming") as keyof typeof TABS;
  const settings = await getSettings();
  const now = new Date();
  const where =
    tab === "cancelled" ? { status: "cancelled" } : tab === "past" ? { status: "confirmed", startUtc: { lt: now } } : { status: "confirmed", startUtc: { gte: now } };
  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { startUtc: tab === "upcoming" ? "asc" : "desc" },
    take: 200,
    include: { client: { include: { _count: { select: { bookings: true } } } }, eventType: { select: { title: true } }, _count: { select: { files: true } } },
  });

  const groups: { day: string; items: typeof bookings }[] = [];
  for (const b of bookings) {
    const day = DateTime.fromJSDate(b.startUtc, { zone: settings.timezone }).toFormat("cccc d LLLL yyyy");
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1)!.items.push(b);
  }

  return (
    <div className="max-w-4xl">
      <GettingStarted />
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <div className="mt-4 flex gap-2">
        {Object.entries(TABS).map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} className={`rounded-full px-3 py-1 text-sm ${k === tab ? "btn-brand" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>
            {label}
          </Link>
        ))}
      </div>
      {bookings.length === 0 && <p className="mt-8 text-stone-500">No {TABS[tab].toLowerCase()} bookings.</p>}
      <ul className="mt-6 space-y-1">
        {groups.map((g) => (
          <li key={g.day}>
            <h2 className="mb-2 mt-6 text-sm font-semibold text-stone-500">{g.day}</h2>
            <ul className="space-y-2">
              {g.items.map((b) => (
                <li key={b.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white px-4 py-3 ring-1 ring-stone-200 hover:ring-[var(--brand)]">
                  <span className="w-20 shrink-0 text-sm font-medium tabular-nums">{DateTime.fromJSDate(b.startUtc, { zone: settings.timezone }).toFormat("h:mm a")}</span>
                  <span className="min-w-0 flex-1 basis-48">
                    <Link href={`/admin/bookings/${b.id}`} className="block truncate font-medium after:absolute after:inset-0 after:content-['']">
                      {b.client.name}
                    </Link>
                    <span className="block truncate text-sm text-stone-500">{b.eventType.title}</span>
                  </span>
                  <span className="relative z-10 flex min-w-0 basis-64 flex-col text-sm text-stone-600">
                    <a href={`mailto:${b.client.email}`} className="truncate hover:text-[var(--brand)] hover:underline">✉ {b.client.email}</a>
                    {(b.phone || b.client.phone) ? (
                      <a href={`tel:${(b.phone || b.client.phone)!.replace(/[^\d+]/g, "")}`} className="truncate hover:text-[var(--brand)] hover:underline">☎ {b.phone || b.client.phone}</a>
                    ) : (
                      <span className="text-stone-400">☎ no number</span>
                    )}
                    <span className="text-xs text-stone-400">
                      {b.timezone !== settings.timezone ? `${b.timezone.replace(/_/g, " ")} · ${DateTime.fromJSDate(b.startUtc, { zone: b.timezone }).toFormat("h:mm a")} their time · ` : ""}
                      {b.client._count.bookings} booking{b.client._count.bookings === 1 ? "" : "s"} total
                    </span>
                  </span>
                  <span className="flex gap-1">
                    {b._count.files > 0 && <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">📎 {b._count.files}</span>}
                    {b.rescheduledFromId && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Rescheduled</span>}
                    {b.source === "cal.com" && <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">From Cal.com</span>}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
