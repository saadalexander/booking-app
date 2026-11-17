import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import ScheduleForm from "./ScheduleForm";

export default async function EditSchedulePage({ params }: PageProps<"/admin/schedules/[id]">) {
  const { id } = await params;
  const isNew = id === "new";
  const s = isNew ? null : await prisma.schedule.findUnique({ where: { id }, include: { rules: true, overrides: { orderBy: { date: "asc" } } } });
  if (!isNew && !s) notFound();
  // A booking type's own custom hours are edited in that booking type's editor.
  if (s?.customForEventTypeId) redirect(`/admin/event-types/${s.customForEventTypeId}`);
  const settings = await getSettings();
  return (
    <div className="max-w-3xl">
      <Link href="/admin/schedules" className="text-sm text-stone-500 hover:text-stone-800">← Availability</Link>
      <h1 className="mt-3 text-2xl font-semibold">{s?.name ?? "New schedule"}</h1>
      <ScheduleForm
        id={s?.id ?? ""}
        initial={{
          name: s?.name ?? "",
          timezone: s?.timezone ?? settings.timezone,
          rules: s?.rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })) ?? [],
          overrides: s?.overrides.map((o) => ({ date: o.date, startMinute: o.startMinute, endMinute: o.endMinute })) ?? [],
        }}
      />
    </div>
  );
}
