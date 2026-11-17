import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseJson, type Consent } from "@/lib/settings";
import { deleteEventType } from "../../../actions";
import { appUrl, getSettings } from "@/lib/settings";
import { listMailerliteGroups } from "@/lib/mailerlite";
import EventTypeForm, { type EventTypeFormValues } from "./EventTypeForm";
import CopyButton from "../../events/[id]/CopyButton";

export default async function EditEventTypePage({ params, searchParams }: PageProps<"/admin/event-types/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  // Shared schedules only; a booking type's own custom hours are edited inside its editor.
  const schedules = await prisma.schedule.findMany({ where: { customForEventTypeId: null }, select: { id: true, name: true, isDefault: true }, orderBy: { name: "asc" } });
  const isNew = id === "new";
  const et = isNew ? null : await prisma.eventType.findUnique({ where: { id }, include: { questions: { orderBy: { position: "asc" } } } });
  if (!isNew && !et) notFound();
  const settings = await getSettings();
  const mlConnected = Boolean(settings.mailerliteKey);
  const mailerliteGroups = mlConnected ? await listMailerliteGroups() : null;
  const categories = await prisma.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } });
  const custom = et ? await prisma.schedule.findUnique({ where: { customForEventTypeId: et.id }, include: { rules: true, overrides: { orderBy: { date: "asc" } } } }) : null;
  // Starting point for custom hours: the existing custom hours, else a copy of the current shared schedule.
  const base = custom ?? (et ? await prisma.schedule.findUnique({ where: { id: et.scheduleId }, include: { rules: true, overrides: true } }) : null);
  const customHours = {
    timezone: base?.timezone ?? settings.timezone,
    rules: (base?.rules ?? []).map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
    overrides: custom ? custom.overrides.map((o) => ({ date: o.date, startMinute: o.startMinute, endMinute: o.endMinute })) : [],
  };

  const values: EventTypeFormValues = et
    ? {
        id: et.id,
        title: et.title,
        slug: et.slug,
        description: et.description,
        durationMinutes: et.durationMinutes,
        hidden: et.hidden,
        locationType: et.locationType,
        locationDetail: et.locationDetail ?? "",
        scheduleId: schedules.some((x) => x.id === et.scheduleId) ? et.scheduleId : schedules.find((x) => x.isDefault)?.id ?? schedules[0]?.id ?? "",
        bufferBeforeMinutes: et.bufferBeforeMinutes,
        bufferAfterMinutes: et.bufferAfterMinutes,
        minNoticeMinutes: et.minNoticeMinutes,
        periodType: et.periodType,
        periodDays: et.periodDays,
        periodStart: et.periodStart ?? "",
        periodEnd: et.periodEnd ?? "",
        slotIntervalMinutes: et.slotIntervalMinutes,
        seats: et.seats,
        dailyCap: et.dailyCap,
        firstSlotOnly: et.firstSlotOnly,
        optimizedSlots: et.optimizedSlots,
        lockTimezone: et.lockTimezone,
        allowGuests: et.allowGuests,
        collectPhone: et.collectPhone,
        showNotes: et.showNotes,
        neutralTitle: et.neutralTitle ?? "",
        cancelWindowHours: et.cancelWindowHours,
        checklist: parseJson<string[]>(et.checklist, []).join("\n"),
        questions: et.questions.map((q) => ({ key: q.key, label: q.label, type: q.type, required: q.required, options: parseJson<string[]>(q.options, []) })),
        consents: parseJson<Consent[]>(et.consents, []),
        source: et.source,
        categoryId: et.categoryId ?? "",
        mailerliteGroupId: et.mailerliteGroupId ?? "",
        mailerliteFieldPrefix: et.mailerliteFieldPrefix ?? "",
      }
    : {
        id: "",
        title: "",
        slug: "",
        description: "",
        durationMinutes: 30,
        hidden: false,
        locationType: "google_meet",
        locationDetail: "",
        scheduleId: schedules.find((s) => s.isDefault)?.id ?? schedules[0]?.id ?? "",
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minNoticeMinutes: 1440,
        periodType: "unlimited",
        periodDays: null,
        periodStart: "",
        periodEnd: "",
        slotIntervalMinutes: null,
        seats: null,
        dailyCap: null,
        firstSlotOnly: false,
        optimizedSlots: false,
        lockTimezone: false,
        allowGuests: true,
        collectPhone: "hidden",
        showNotes: true,
        neutralTitle: "",
        cancelWindowHours: null,
        checklist: "",
        questions: [],
        consents: [],
        source: null,
        categoryId: typeof sp.category === "string" ? sp.category : "",
        mailerliteGroupId: "",
        mailerliteFieldPrefix: "",
      };

  return (
    <div className="max-w-5xl">
      <Link href="/admin/event-types" className="text-sm text-stone-500 hover:text-stone-800">← Booking types</Link>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{isNew ? "New booking type" : et!.title}</h1>
        {!isNew && (
          <div className="flex shrink-0 items-center gap-2">
            <CopyButton text={`${appUrl()}/${et!.slug}`} label="Copy link" />
            <Link href={`/${et!.slug}`} target="_blank" className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200 hover:ring-stone-400">Open booking page ↗</Link>
          </div>
        )}
      </div>
      {et?.source === "cal.com" && <p className="mt-1 text-sm text-stone-500">Imported from Cal.com.</p>}
      {sp.saved === "1" && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Saved.</p>}
      <EventTypeForm values={values} schedules={schedules} categories={categories} mailerliteGroups={mailerliteGroups} hasCustomHours={Boolean(custom)} customHours={customHours} />
      {!isNew && (
        <form action={deleteEventType} className="mt-8 border-t border-stone-200 pt-6">
          <input type="hidden" name="id" value={et!.id} />
          <button className="text-sm text-red-700 underline">Delete this booking type</button>
          <p className="mt-1 text-xs text-stone-500">If it has bookings it will be hidden instead, so history is kept.</p>
        </form>
      )}
    </div>
  );
}
