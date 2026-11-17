import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { EVENT_LOCATIONS, googleCalendarLink, seatsTaken } from "@/lib/group-events";
import { renderMarkdown } from "@/lib/markdown";
import { brandStyle, getSettings } from "@/lib/settings";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const ev = await prisma.groupEvent.findUnique({ where: { slug } });
  return ev && ev.status !== "draft" ? ev : null;
}

export async function generateMetadata({ params }: PageProps<"/e/[slug]">) {
  const ev = await load((await params).slug);
  return { title: ev?.title ?? "Event" };
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const ev = await load(slug);
  if (!ev) notFound();
  const settings = await getSettings();
  const taken = await seatsTaken(ev.id);
  const left = ev.capacity == null ? null : Math.max(0, ev.capacity - taken);
  const start = DateTime.fromJSDate(ev.startUtc, { zone: ev.timezone });
  const minutes = Math.round((ev.endUtc.getTime() - ev.startUtc.getTime()) / 60_000);
  const closed = ev.status === "cancelled" ? "This event has been cancelled." : ev.startUtc <= new Date() ? "Registration has closed — this event has started or finished." : left === 0 ? "This event is full." : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" style={brandStyle(settings.brandColor)}>
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">← All bookings &amp; events</Link>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <article className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/avatar.png" alt="" className="h-8 w-8 rounded-full object-cover" />
            <p className="text-sm text-stone-500">{settings.businessName}</p>
          </div>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--brand)]">Group event</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{ev.title}</h1>
          <ul className="mt-4 space-y-1.5 text-sm text-stone-700">
            <li>📅 {start.toFormat("cccc d LLLL yyyy")}</li>
            <li>🕒 {start.toFormat("h:mm a")} ({ev.timezone.replace(/_/g, " ")}) · {minutes} min</li>
            <li>📍 {ev.locationType === "in_person" && ev.locationDetail ? `In person — ${ev.locationDetail.split(",").slice(-2).join(",").trim()}` : EVENT_LOCATIONS[ev.locationType] ?? "Online"}</li>
            {left != null && ev.status === "published" && <li>🎟 {left === 0 ? "Full" : `${left} of ${ev.capacity} seats left`}</li>}
          </ul>
          {ev.description && <div className="prose-desc mt-6 text-sm text-stone-700" dangerouslySetInnerHTML={{ __html: renderMarkdown(ev.description) }} />}
        </article>
        <div className="md:sticky md:top-6 md:self-start">
          {closed ? (
            <div className="rounded-xl bg-white p-6 ring-1 ring-stone-200">
              <p className="font-display text-lg">Registration closed</p>
              <p className="mt-2 text-sm text-stone-600">{closed}</p>
              <Link href="/" className="mt-4 inline-block text-sm underline">See other times and events</Link>
            </div>
          ) : (
            <RegisterForm slug={ev.slug} startIso={ev.startUtc.toISOString()} endIso={ev.endUtc.toISOString()} eventTz={ev.timezone} googleLink={googleCalendarLink(ev)} />
          )}
        </div>
      </div>
    </main>
  );
}
