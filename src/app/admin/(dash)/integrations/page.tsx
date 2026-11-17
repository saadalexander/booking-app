import { getConnection, googleConfigured, listCalendars, redirectUri, safeModeRecipient, type CalendarInfo } from "@/lib/google";
import { getSettings } from "@/lib/settings";
import { disconnectGoogle } from "../../actions";
import CalendarChoices from "./CalendarChoices";
import MailerliteForm from "./MailerliteForm";
import { removeMailerliteKey } from "../../mailerlite-actions";
import { prisma } from "@/lib/db";

const ERRORS: Record<string, string> = {
  "not-configured": "Google isn't set up yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing from .env.",
  state: "The connection attempt expired or didn't match. Please try again.",
  access_denied: "Google access wasn't allowed.",
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/admin/integrations">) {
  const sp = await searchParams;
  const [conn, settings] = await Promise.all([getConnection(), getSettings()]);
  const safe = safeModeRecipient();
  const delivery = process.env.EMAIL_DELIVERY ?? "outbox";

  let calendars: CalendarInfo[] = [];
  let calendarError: string | null = null;
  if (conn) {
    try {
      calendars = await listCalendars();
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
    }
  }
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? sp.error : null;

  const mlTypes = await prisma.eventType.findMany({ where: { mailerliteGroupId: { not: null } }, select: { id: true, title: true } });

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Google &amp; email</h1>

      {safe && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>Safe mode is on.</strong> Every email goes to <strong>{safe}</strong> instead of the client, and calendar events are created without
          inviting anyone. Remove <code>SAFE_MODE_REDIRECT_TO</code> from <code>.env</code> when you go live.
        </div>
      )}
      {sp.connected === "1" && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Google connected ✓</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="font-semibold">Google account</h2>
        {!googleConfigured() ? (
          <p className="mt-2 text-sm text-stone-600">
            Waiting for the Google Cloud app. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code> (redirect URI:{" "}
            <code>{redirectUri()}</code>), then restart the app.
          </p>
        ) : conn ? (
          <div className="mt-2 space-y-3 text-sm">
            <p>
              Connected as <strong>{conn.email}</strong>
              {conn.email.toLowerCase() !== settings.ownerEmail.toLowerCase() && (
                <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-amber-800">different from your Settings email ({settings.ownerEmail})</span>
              )}
            </p>
            {conn.lastError && <p className="rounded bg-red-50 p-2 text-red-800">Last problem: {conn.lastError}</p>}
            <form action={disconnectGoogle}>
              <button className="text-red-700 underline">Disconnect Google</button>
            </form>
          </div>
        ) : (
          <div className="mt-2 space-y-3 text-sm text-stone-600">
            <p>Connect {settings.ownerEmail} to check your calendars for clashes, add bookings with Google Meet links, and send emails from your address.</p>
            {/* Full-page navigation (not <Link>): the route redirects to Google and must not be prefetched. */}
            <form action="/api/google/connect" method="get">
              <button className="btn-brand rounded-lg px-4 py-2 font-medium">Connect Google</button>
            </form>
          </div>
        )}
      </section>

      {conn && (
        <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="font-semibold">Calendars</h2>
          {calendarError ? (
            <p className="mt-2 text-sm text-red-700">{calendarError}</p>
          ) : (
            <CalendarChoices
              calendars={calendars}
              destination={conn.destinationCalendarId === "primary" ? calendars.find((c) => c.primary)?.id ?? "primary" : conn.destinationCalendarId}
              conflicts={(JSON.parse(conn.conflictCalendarIds) as string[]).map((id) => (id === "primary" ? calendars.find((c) => c.primary)?.id ?? id : id))}
            />
          )}
        </section>
      )}

      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200 text-sm">
        <h2 className="font-semibold">Email delivery</h2>
        <p className="mt-2 text-stone-600">
          {delivery === "gmail"
            ? conn
              ? `Sending through Gmail as ${conn.email}.`
              : "Set to Gmail — emails go to the outbox until Google is connected."
            : "Outbox only — emails are recorded in the Email outbox and not sent."}
        </p>
      </section>
          <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="font-semibold">MailerLite</h2>
        <p className="mt-1 text-sm text-stone-600">
          Adds people to a MailerLite group when they book, so your MailerLite sequences (like the ZION nurture) start automatically. Pick the group on each
          booking type, under “MailerLite”.
        </p>
        {settings.mailerliteKey ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>Connected ✓</p>
            <p className="text-stone-600">
              {mlTypes.length ? <>Sending bookings from: {mlTypes.map((t) => t.title).join(", ")}</> : "No booking types send to MailerLite yet."}
            </p>
            <form action={removeMailerliteKey}>
              <button className="text-red-700 underline">Disconnect MailerLite</button>
            </form>
          </div>
        ) : (
          <MailerliteForm />
        )}
      </section>
</div>
  );
}
