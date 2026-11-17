import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import CancelBooking from "@/components/CancelBooking";
import { clientCanChange, loadByToken } from "@/lib/bookings";
import { brandStyle, changeWindowHours, getSettings, LOCATION_LABELS } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking" };

/** Client's manage page — reached via the unguessable link in their emails. */
export default async function ManageBookingPage({ params, searchParams }: PageProps<"/booking/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const b = await loadByToken(token);
  if (!b) notFound();
  const settings = await getSettings();
  const policy = await clientCanChange(b);
  const start = DateTime.fromJSDate(b.startUtc, { zone: b.timezone });
  const cancelled = b.status === "cancelled";
  const isNew = sp.new === "1";
  const wasRescheduled = sp.rescheduled === "1";
  const hours = changeWindowHours(b.eventType, settings.defaultCancelWindowHours);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12" style={brandStyle(settings.brandColor)}>
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${cancelled ? "bg-stone-200" : "btn-brand"}`}>
            {cancelled ? "✕" : "✓"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {cancelled ? "This booking is cancelled" : isNew ? "You're booked in" : wasRescheduled ? "Your booking has been moved" : "Your booking"}
          </h1>
          {!cancelled && (isNew || wasRescheduled) && <p className="mt-1 text-stone-600">A confirmation is on its way to {b.client.email}.</p>}
        </div>

        <dl className="mt-6 space-y-3 border-t border-stone-200 pt-6 text-sm">
          <Row label="What">{b.eventType.title}</Row>
          <Row label="When">
            {start.toFormat("cccc d LLLL yyyy")}
            <br />
            {start.toFormat("h:mm a")} – {start.plus({ minutes: b.eventType.durationMinutes }).toFormat("h:mm a")} ({b.timezone.replace(/_/g, " ")})
          </Row>
          <Row label="Where">
            {LOCATION_LABELS[b.eventType.locationType] ?? b.eventType.locationType}
            {b.eventType.locationType === "phone" && b.phone ? ` — ${settings.ownerName} will call ${b.phone}` : ""}
          </Row>
          <Row label="Who">{b.client.name}</Row>
        </dl>

        {!cancelled && (
          <div className="mt-8 border-t border-stone-200 pt-6">
            {policy.ok ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={`/${b.eventType.slug}?reschedule=${token}`} className="btn-brand ring-brand flex-1 rounded-lg px-4 py-2.5 text-center font-medium">
                  Reschedule
                </Link>
                <CancelBooking token={token} />
              </div>
            ) : (
              <p className="text-sm text-stone-600">
                This appointment is less than {hours} hours away, so it can&apos;t be changed online. Please contact {settings.ownerName} directly.
              </p>
            )}
            {policy.ok && hours > 0 && <p className="mt-3 text-center text-xs text-stone-500">Changes are possible online up to {hours} hours before the start.</p>}
          </div>
        )}
        {cancelled && (
          <Link href="/" className="btn-brand ring-brand mt-8 block rounded-lg px-4 py-2.5 text-center font-medium">
            Book a new time
          </Link>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{children}</dd>
    </div>
  );
}
