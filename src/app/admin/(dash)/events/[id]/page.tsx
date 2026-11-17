import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { appUrl, getSettings } from "@/lib/settings";
import { cancelEvent, deleteGroupEvent, removeRegistration } from "../../../event-actions";
import CopyButton from "./CopyButton";
import EventForm, { type EventFormValues } from "./EventForm";

export const metadata = { title: "Event" };

export default async function EventPage({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const settings = await getSettings();
  const ev = isNew ? null : await prisma.groupEvent.findUnique({ where: { id }, include: { registrations: { orderBy: { createdAt: "asc" } } } });
  if (!isNew && !ev) notFound();
  const regs = ev?.registrations.filter((r) => r.status === "registered") ?? [];
  const cancelled = ev?.registrations.filter((r) => r.status === "cancelled") ?? [];
  const local = ev ? DateTime.fromJSDate(ev.startUtc, { zone: ev.timezone }) : DateTime.now().setZone(settings.timezone).plus({ days: 14 }).set({ hour: 18, minute: 0 });
  const values: EventFormValues = {
    id: ev?.id ?? "",
    title: ev?.title ?? "",
    slug: ev?.slug ?? "",
    description: ev?.description ?? "",
    date: local.toISODate()!,
    time: local.toFormat("HH:mm"),
    durationMinutes: ev ? Math.round((ev.endUtc.getTime() - ev.startUtc.getTime()) / 60_000) : 60,
    timezone: ev?.timezone ?? settings.timezone,
    locationType: ev?.locationType ?? "google_meet",
    locationDetail: ev?.locationDetail ?? "",
    capacity: ev?.capacity ?? null,
    status: ev?.status ?? "published",
  };
  const url = ev ? `${appUrl()}/e/${ev.slug}` : "";
  const past = ev ? ev.endUtc < new Date() : false;

  return (
    <div className="max-w-4xl">
      <Link href="/admin/events" className="text-sm text-stone-500 hover:text-stone-800">← Events</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{ev?.title ?? "New event"}</h1>
        {ev && ev.status !== "draft" && <Link href={`/e/${ev.slug}`} target="_blank" className="text-sm underline">Open event page ↗</Link>}
      </div>
      {sp.saved === "1" && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Event created. Share its link to start taking registrations.</p>}
      {sp.error === "has-registrations" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">People have registered, so it can&apos;t be deleted — cancel it instead (they&apos;ll be emailed).</p>}
      {ev?.status === "cancelled" && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">This event is cancelled. Registrants were emailed.</p>}
      {ev?.googleSyncError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Google Calendar: {ev.googleSyncError}</p>}

      {ev && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
            <h2 className="text-lg font-semibold">
              Registrations · {regs.length}
              {ev.capacity ? ` of ${ev.capacity}` : ""}
            </h2>
            <div className="flex flex-wrap gap-2">
              {url && <CopyButton text={url} label="Copy event link" />}
              {regs.length > 0 && <CopyButton text={regs.map((r) => r.email).join(", ")} label="Copy all emails" />}
            </div>
          </div>
          {ev.meetUrl && <p className="mt-3 text-sm text-stone-600">Meet link: <a className="underline" href={ev.meetUrl} target="_blank">{ev.meetUrl}</a></p>}
          {regs.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">No one has registered yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#151B1F] text-white">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Registered</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r) => (
                    <tr key={r.id} className="border-b border-stone-100">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2"><a className="hover:underline" href={`mailto:${r.email}`}>{r.email}</a></td>
                      <td className="px-3 py-2">{r.phone ? <a className="hover:underline" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a> : <span className="text-stone-400">—</span>}</td>
                      <td className="px-3 py-2 text-stone-500">{DateTime.fromJSDate(r.createdAt, { zone: settings.timezone }).toFormat("d LLL, h:mm a")}</td>
                      <td className="px-3 py-2 text-right">
                        {!past && ev.status !== "cancelled" && (
                          <form action={removeRegistration}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="text-xs text-stone-500 underline hover:text-red-700">Remove</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cancelled.length > 0 && <p className="mt-3 text-xs text-stone-500">{cancelled.length} cancelled: {cancelled.map((r) => r.name).join(", ")}</p>}
        </section>
      )}

      <EventForm values={values} />

      {ev && ev.status !== "cancelled" && !past && (
        <section className="mt-10 rounded-xl border border-red-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-red-800">Cancel event</h2>
          <form action={cancelEvent} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="id" value={ev.id} />
            <input name="reason" className="input flex-1" placeholder="Message to registrants (optional)" />
            <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white">Cancel and email {regs.length} {regs.length === 1 ? "person" : "people"}</button>
          </form>
        </section>
      )}
      {ev && ev.registrations.length === 0 && (
        <form action={deleteGroupEvent} className="mt-6">
          <input type="hidden" name="id" value={ev.id} />
          <button className="text-sm text-red-700 underline">Delete this event</button>
        </form>
      )}
    </div>
  );
}
