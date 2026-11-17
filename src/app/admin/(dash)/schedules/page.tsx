import Link from "next/link";
import { prisma } from "@/lib/db";

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function SchedulesPage() {
  const schedules = await prisma.schedule.findMany({
    include: { rules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }, _count: { select: { eventTypes: true, overrides: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Availability</h1>
        <Link href="/admin/schedules/new" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">New schedule</Link>
      </div>
      <ul className="mt-6 space-y-2">
        {schedules.map((s) => (
          <li key={s.id}>
            <Link href={s.customForEventTypeId ? `/admin/event-types/${s.customForEventTypeId}` : `/admin/schedules/${s.id}`} className="block rounded-lg bg-white px-4 py-3 ring-1 ring-stone-200 hover:ring-[var(--brand)]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.name}</span>
                {s.isDefault && <span className="rounded bg-stone-100 px-1.5 text-xs">Default</span>}
                {s.source === "cal.com" && <span className="rounded bg-stone-100 px-1.5 text-xs">From Cal.com</span>}
                {s.customForEventTypeId && <span className="rounded bg-amber-50 px-1.5 text-xs text-amber-800">Custom hours for one booking type</span>}
              </div>
              <p className="mt-0.5 text-sm text-stone-600">
                {s.rules.map((r) => `${DAYS[r.weekday]} ${hm(r.startMinute)}–${hm(r.endMinute)}`).join(" · ") || "No weekly hours"}
              </p>
              <p className="text-xs text-stone-500">
                {s.timezone.replace(/_/g, " ")} · used by {s._count.eventTypes} booking type{s._count.eventTypes === 1 ? "" : "s"}
                {s._count.overrides ? ` · ${s._count.overrides} date override${s._count.overrides === 1 ? "" : "s"}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
