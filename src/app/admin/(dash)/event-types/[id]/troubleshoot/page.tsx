import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getAvailability, getEventTypeBySlug } from "@/lib/availability";
import { getConnection, getGoogleBusy } from "@/lib/google";
import { windowsForDate } from "@/lib/slots";

const DAYS = 14;
const hm = (ms: number, tz: string) => DateTime.fromMillis(ms, { zone: tz }).toFormat("h:mm a");

/** Shows, day by day, why a booking type has (or hasn't) got free times: working hours, calendar clashes, notice. */
export default async function TroubleshootPage({ params, searchParams }: PageProps<"/admin/event-types/[id]/troubleshoot">) {
  const { id } = await params;
  const sp = await searchParams;
  const row = await prisma.eventType.findUnique({ where: { id }, select: { slug: true } });
  if (!row) notFound();
  const et = (await getEventTypeBySlug(row.slug))!;
  const tz = et.schedule.timezone;
  const now = DateTime.now().setZone(tz).startOf("day");
  const asked = typeof sp.from === "string" ? DateTime.fromISO(sp.from, { zone: tz }) : null;
  const today = asked?.isValid && asked > now ? asked.startOf("day") : now;
  const end = today.plus({ days: DAYS - 1 });

  const conn = await getConnection();
  let googleError = "";
  let external: { start: number; end: number }[] = [];
  try {
    external = await getGoogleBusy(today.toJSDate(), end.plus({ days: 1 }).toJSDate());
  } catch (e) {
    googleError = e instanceof Error ? e.message : String(e);
  }
  const bookings = await prisma.booking.findMany({
    where: { status: "confirmed", startUtc: { lt: end.plus({ days: 1 }).toJSDate() }, endUtc: { gt: today.toJSDate() } },
    select: { startUtc: true, endUtc: true, client: { select: { name: true } }, eventType: { select: { title: true } } },
  });
  let days: Awaited<ReturnType<typeof getAvailability>> = [];
  try {
    days = await getAvailability(et, today.toISODate()!, end.toISODate()!, tz);
  } catch (e) {
    googleError ||= e instanceof Error ? e.message : String(e);
  }
  const noticeUntil = DateTime.now().toMillis() + et.minNoticeMinutes * 60_000;

  const rows = Array.from({ length: DAYS }, (_, i) => {
    const d = today.plus({ days: i });
    const iso = d.toISODate()!;
    const windows = windowsForDate(d, et.schedule.rules, et.schedule.overrides);
    const dayStart = d.toMillis();
    const dayEnd = d.plus({ days: 1 }).toMillis();
    const clashes = [
      ...external.filter((b) => b.start < dayEnd && b.end > dayStart).map((b) => ({ ...b, label: b.end - b.start >= 86_400_000 ? "All-day calendar event" : "Calendar event" })),
      ...bookings
        .filter((b) => b.startUtc.getTime() < dayEnd && b.endUtc.getTime() > dayStart)
        .map((b) => ({ start: b.startUtc.getTime(), end: b.endUtc.getTime(), label: `Booking: ${b.client.name} (${b.eventType.title})` })),
    ].sort((a, b) => a.start - b.start);
    const slots = days.find((x) => x.date === iso)?.spots.length ?? 0;
    let reason = "";
    if (slots === 0) {
      if (windows.length === 0) reason = et.schedule.overrides.some((o) => o.date === iso) ? "Marked unavailable for this date" : "Not a working day in this schedule";
      else if (windows.every(([, e]) => e <= noticeUntil)) reason = "Inside the minimum notice period";
      else if (windows.every(([s, e]) => clashes.some((c) => c.start <= Math.max(s, noticeUntil) && c.end >= e))) reason = "Fully blocked by calendar events";
      else if (clashes.length) reason = "Calendar events leave no gap long enough";
      else reason = "Outside the booking window or daily limit";
    }
    return { d, windows, clashes, slots, reason };
  });

  return (
    <div className="max-w-4xl">
      <Link href="/admin/event-types" className="text-sm text-stone-500 hover:text-stone-800">← Booking types</Link>
      <h1 className="mt-3 text-2xl font-semibold">Troubleshoot: {et.title}</h1>
      <p className="mt-1 text-sm text-stone-600">
        Why times are or aren&apos;t offered over the next {DAYS} days. Hours from <strong>{et.schedule.customForEventTypeId ? "this booking type's custom hours" : et.schedule.name}</strong> ({tz.replace(/_/g, " ")}), {et.durationMinutes} min long, {et.minNoticeMinutes >= 1440 ? `${+(et.minNoticeMinutes / 1440).toFixed(1)} days` : et.minNoticeMinutes >= 60 ? `${Math.round(et.minNoticeMinutes / 60)} h` : `${et.minNoticeMinutes} min`} minimum notice.
      </p>
      <p className="mt-2 text-sm text-stone-600">
        {conn ? `Checking ${JSON.parse(conn.conflictCalendarIds).length} Google calendar(s) for clashes.` : "Google Calendar isn't connected, so only bookings made here count as clashes."}
      </p>
      <form className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="from" className="text-stone-600">Start from</label>
        <input id="from" type="date" name="from" defaultValue={today.toISODate()!} className="input !w-auto !py-1.5" />
        <button className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-stone-200 hover:ring-stone-400">Show</button>
        <Link href={`?from=${today.plus({ days: DAYS }).toISODate()}`} className="rounded-lg px-3 py-1.5 text-stone-600 hover:bg-stone-100">Next {DAYS} days →</Link>
      </form>
      {googleError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Google Calendar couldn&apos;t be read: {googleError}</p>}

      <ul className="mt-6 space-y-2">
        {rows.map((r) => (
          <li key={r.d.toISODate()} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{r.d.toFormat("cccc d LLL")}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.slots ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
                {r.slots ? `${r.slots} time${r.slots === 1 ? "" : "s"} offered` : r.reason}
              </span>
            </div>
            <p className="mt-1 text-sm text-stone-600">
              Hours: {r.windows.length ? r.windows.map(([s, e]) => `${hm(s, tz)}–${hm(e, tz)}`).join(", ") : "none"}
            </p>
            {r.clashes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-sm text-stone-500">
                {r.clashes.map((c, i) => (
                  <li key={i}>
                    ⛔ {c.end - c.start >= 86_400_000 ? "All day" : `${hm(c.start, tz)}–${hm(c.end, tz)}`} · {c.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
