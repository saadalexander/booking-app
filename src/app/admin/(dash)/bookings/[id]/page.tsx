import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getSettings, LOCATION_LABELS, parseJson, type Consent } from "@/lib/settings";
import { ownerCancelBooking } from "../../../actions";

export default async function BookingDetail({ params }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { client: true, eventType: { include: { questions: true } }, files: true },
  });
  if (!b) notFound();
  const settings = await getSettings();
  const start = DateTime.fromJSDate(b.startUtc, { zone: settings.timezone });
  const answers = parseJson<Record<string, string | string[]>>(b.answers, {});
  const consents = parseJson<Record<string, boolean>>(b.consents, {});
  const consentDefs = parseJson<Consent[]>(b.eventType.consents, []);
  const guests = parseJson<string[]>(b.guests, []);
  const labelFor = (key: string) => b.eventType.questions.find((q) => q.key === key)?.label ?? key;
  const history = await prisma.booking.count({ where: { clientId: b.clientId } });

  return (
    <div className="max-w-3xl">
      <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-800">← Bookings</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{b.client.name}</h1>
          <p className="text-stone-600">{b.eventType.title}</p>
          {b.source === "cal.com" && <p className="mt-1 text-xs text-stone-500">Imported from Cal.com — managing it here moves or cancels the same calendar event.</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${b.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-stone-200 text-stone-700"}`}>
          {b.status === "confirmed" ? "Confirmed" : `Cancelled${b.cancelledBy ? ` by ${b.cancelledBy}` : ""}`}
        </span>
      </div>

      <section className="mt-6 grid gap-4 rounded-xl bg-white p-5 ring-1 ring-stone-200 sm:grid-cols-2">
        <Info label="When">{start.toFormat("cccc d LLL yyyy, h:mm a")} ({settings.timezone.replace(/_/g, " ")})</Info>
        <Info label="Client's timezone">{b.timezone.replace(/_/g, " ")}</Info>
        <Info label="Where">{LOCATION_LABELS[b.eventType.locationType] ?? b.eventType.locationType}</Info>
        <Info label="Length">{Math.round((b.endUtc.getTime() - b.startUtc.getTime()) / 60000)} min</Info>
        <Info label="Email"><a className="underline" href={`mailto:${b.client.email}`}>{b.client.email}</a></Info>
        <Info label="Phone">{b.phone || b.client.phone || "—"}</Info>
        {guests.length > 0 && <Info label="Guests">{guests.join(", ")}</Info>}
        <Info label="Client history"><Link className="underline" href={`/admin/clients?email=${encodeURIComponent(b.client.email)}`}>{history} booking{history === 1 ? "" : "s"}</Link></Info>
        {b.cancelReason && <Info label="Cancel reason">{b.cancelReason}</Info>}
        {b.meetUrl && <Info label="Video link"><a className="underline" href={b.meetUrl} target="_blank" rel="noopener noreferrer">{b.meetUrl}</a></Info>}
        <Info label="Google Calendar">{b.googleEventId ? "Synced ✓" : b.googleSyncError ? "Not synced" : "—"}</Info>
      </section>
      {b.mailerliteSyncError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">MailerLite: {b.mailerliteSyncError}</p>}
      {b.googleSyncError && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Calendar sync problem: {b.googleSyncError}</p>
      )}

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="font-semibold">Intake answers</h2>
        {Object.keys(answers).length === 0 && !b.notes && <p className="mt-2 text-sm text-stone-500">No answers.</p>}
        <dl className="mt-3 space-y-4">
          {Object.entries(answers).map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-stone-500">{labelFor(k)}</dt>
              <dd className="whitespace-pre-wrap">{Array.isArray(v) ? v.join(", ") : v || "—"}</dd>
            </div>
          ))}
          {b.notes && (
            <div>
              <dt className="text-sm text-stone-500">Anything else</dt>
              <dd className="whitespace-pre-wrap">{b.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      {(b.files.length > 0 || consentDefs.length > 0) && (
        <section className="mt-6 grid gap-6 rounded-xl bg-white p-5 ring-1 ring-stone-200 sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">Files</h2>
            {b.files.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">None uploaded.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {b.files.map((f) => (
                  <li key={f.id}>
                    <a className="underline" href={`/api/files/${f.id}`}>📎 {f.originalName}</a> <span className="text-stone-500">({Math.ceil(f.size / 1024)} KB)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="font-semibold">Consents</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {consentDefs.map((c) => (
                <li key={c.key}>{consents[c.key] ? "☑" : "☐"} {c.label}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {b.status === "confirmed" && (
        <form action={ownerCancelBooking} className="mt-6 space-y-2 rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="font-semibold">Cancel this booking</h2>
          <input type="hidden" name="id" value={b.id} />
          <textarea name="reason" className="input min-h-16 text-sm" placeholder="Message to the client (optional)" />
          <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Cancel and notify client</button>
        </form>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-stone-500">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  );
}
