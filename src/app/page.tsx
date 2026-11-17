import Link from "next/link";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { previewText } from "@/lib/markdown";
import { brandStyle, getSettings, LOCATION_LABELS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [settings, eventTypes, categories] = await Promise.all([
    getSettings(),
    prisma.eventType.findMany({ where: { hidden: false }, orderBy: { position: "asc" } }),
    prisma.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);
  const events = await prisma.groupEvent.findMany({ where: { status: "published", startUtc: { gt: new Date() } }, orderBy: { startUtc: "asc" }, take: 6 });

  const groups = [
    ...categories.map((c) => ({ id: c.id, name: c.name, description: c.description, items: eventTypes.filter((e) => e.categoryId === c.id) })),
    { id: "other", name: "Other", description: "", items: eventTypes.filter((e) => !categories.some((c) => c.id === e.categoryId)) },
  ].filter((g) => g.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12" style={brandStyle(settings.brandColor)}>
      <header className="mb-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/avatar.png" alt={settings.ownerName} className="mx-auto mb-4 h-24 w-24 rounded-full object-cover ring-4 ring-[var(--brand)]" />
        <h1 className="text-3xl font-semibold tracking-tight">{settings.businessName}</h1>
        {settings.tagline && <p className="mt-2 text-stone-600">{settings.tagline}</p>}
      </header>

      {events.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 border-b-2 border-[#151B1F] pb-2">
            <h2 className="text-lg font-semibold">Upcoming events</h2>
          </div>
          <ul className="grid gap-3">
            {events.map((ev) => {
              const d = DateTime.fromJSDate(ev.startUtc, { zone: ev.timezone });
              return (
                <li key={ev.id}>
                  <Link href={`/e/${ev.slug}`} className="ring-brand flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4 transition hover:border-[var(--brand)] hover:shadow-sm">
                    <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-stone-50 py-1.5 ring-1 ring-stone-200">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)]">{d.toFormat("LLL")}</span>
                      <span className="font-display text-xl leading-none">{d.toFormat("d")}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{ev.title}</span>
                      <span className="block text-sm text-stone-500">{d.toFormat("cccc, h:mm a")} ({ev.timezone.replace(/_/g, " ")})</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.id} className="mb-10">
          {groups.length > 1 && (
            <div className="mb-3 border-b-2 border-[#151B1F] pb-2">
              <h2 className="text-lg font-semibold">{g.name}</h2>
              {g.description && <p className="text-sm text-stone-500">{g.description}</p>}
            </div>
          )}
      <ul className="grid gap-3">
        {g.items.map((et) => (
          <li key={et.id}>
            <Link
              href={`/${et.slug}`}
              className="ring-brand block rounded-xl border border-stone-200 bg-white p-5 transition hover:border-[var(--brand)] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold">{et.title}</h3>
                <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-sm text-stone-700">{et.durationMinutes} min</span>
              </div>
              {et.description && <p className="mt-1.5 text-sm text-stone-600">{previewText(et.description)}</p>}
              <p className="mt-2 text-xs text-stone-500">
                {LOCATION_LABELS[et.locationType] ?? et.locationType}
                {et.seats ? ` · Group session, ${et.seats} spots` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
        </section>
      ))}
    </main>
  );
}
