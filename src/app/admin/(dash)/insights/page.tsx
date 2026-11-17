import Link from "next/link";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { computeInsights, RANGES, rangeStart, type RangeKey } from "@/lib/insights";
import { getSettings } from "@/lib/settings";
import { Columns, Ranked } from "./Charts";

export const metadata = { title: "Insights" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-5 ring-1 ring-stone-200 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/admin/insights">) {
  const sp = await searchParams;
  const range = (typeof sp.range === "string" && sp.range in RANGES ? sp.range : "30d") as RangeKey;
  const category = typeof sp.category === "string" ? sp.category : "";
  const settings = await getSettings();
  const tz = settings.timezone;
  const now = DateTime.now().setZone(tz);
  const from = rangeStart(range, now);
  // Include upcoming meetings already booked (to the end of next 30 days) so the page also shows what's ahead.
  const to = now.plus({ days: 30 }).endOf("day");

  const [rows, categories] = await Promise.all([
    prisma.booking.findMany({
      where: category ? { eventType: { categoryId: category === "none" ? null : category } } : {},
      select: {
        id: true,
        status: true,
        startUtc: true,
        endUtc: true,
        createdAt: true,
        cancelledBy: true,
        rescheduledFromId: true,
        clientId: true,
        client: { select: { name: true, email: true } },
        eventTypeId: true,
        eventType: { select: { title: true, category: { select: { name: true } } } },
      },
    }),
    prisma.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
  ]);
  const data = computeInsights(
    rows.map((b) => ({
      ...b,
      clientName: b.client.name,
      clientEmail: b.client.email,
      eventTypeTitle: b.eventType.title,
      categoryName: b.eventType.category?.name ?? null,
    })),
    { from, to, now, tz, range },
  );
  const t = data.totals;
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ range, ...(category ? { category } : {}), ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/admin/insights?${p}`;
  };

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold">Insights</h1>
      <p className="mt-1 text-sm text-stone-500">
        Meetings from {from ? from.toFormat("d LLL yyyy") : "the start"} to {to.toFormat("d LLL yyyy")} (includes what&apos;s already booked for the next 30 days). Times in {tz.replace(/_/g, " ")}.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {Object.entries(RANGES).map(([k, label]) => (
          <Link key={k} href={q({ range: k })} className={`rounded-full px-3 py-1 text-sm ${k === range ? "btn-brand" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-[var(--brand)]"}`}>
            {label}
          </Link>
        ))}
        <form action="/admin/insights" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="range" value={range} />
          <label htmlFor="cat" className="text-sm text-stone-500">Category</label>
          <select id="cat" name="category" defaultValue={category} className="input !w-auto !py-1.5 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">Uncategorised</option>
          </select>
          <button className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200 hover:ring-[var(--brand)]">Apply</button>
        </form>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Meetings" value={String(t.meetings)} sub={`${t.completed} done · ${t.upcoming} upcoming`} />
        <Stat label="Hours booked" value={t.hours.toFixed(t.hours < 10 ? 1 : 0)} sub={t.meetings ? `${Math.round((t.hours * 60) / t.meetings)} min average` : undefined} />
        <Stat label="Cancelled" value={String(t.cancelled)} sub={`${Math.round(t.cancelRate * 100)}% of bookings · ${t.rescheduled} rescheduled`} />
        <Stat label="Contacts" value={String(t.contacts)} sub={`${t.newContacts} new · ${t.returningContacts} returning`} />
        <Stat label="New bookings made" value={String(t.bookedInRange)} sub="Booked during this period" />
        <Stat label="Booked ahead" value={t.avgLeadDays == null ? "–" : `${t.avgLeadDays.toFixed(t.avgLeadDays < 10 ? 1 : 0)} d`} sub="Average time between booking and meeting" />
        <Stat label="Busiest day" value={t.meetings ? data.weekday.reduce((m, d) => (d.value > m.value ? d : m)).label : "–"} sub="Day of the week with most meetings" />
        <Stat label="Most booked" value={data.byType[0] ? String(data.byType[0].value) : "–"} sub={data.byType[0]?.label ?? "No meetings yet"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Meetings over time" sub={`Per ${data.unit}`} className="lg:col-span-2">
          <Columns bars={data.overTime} unit="meeting" />
        </Card>
        <Card title="By category">
          <Ranked bars={data.byCategory} total={t.meetings} />
        </Card>
        <Card title="Most booked booking types" className="lg:col-span-2">
          <Ranked bars={data.byType} total={t.meetings} />
        </Card>
        <Card title="Top contacts" sub="Most meetings in this period">
          <Ranked bars={data.topContacts} empty="No contacts in this period." />
        </Card>
        <Card title="Popular days">
          <Columns bars={data.weekday} unit="meeting" height={140} labelEvery={1} />
        </Card>
        <Card title="Popular start times">
          <Columns bars={data.hourBars} unit="meeting" height={140} />
        </Card>
        <Card title="Cancellations by booking type">
          <Ranked bars={data.cancelledByType} empty="No cancellations in this period." />
        </Card>
      </div>
    </div>
  );
}
