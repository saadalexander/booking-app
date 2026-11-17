import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { describe, TEMPLATES } from "@/lib/workflows";
import { BuiltInSwitch, WorkflowSwitch } from "./Toggles";

export const metadata = { title: "Automations" };

export default async function WorkflowsPage() {
  const [workflows, eventTypes, settings] = await Promise.all([
    prisma.workflow.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { sends: true } } } }),
    prisma.eventType.findMany({ select: { id: true, title: true } }),
    getSettings(),
  ]);
  const titles = new Map(eventTypes.map((e) => [e.id, e.title]));
  const scope = (json: string) => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(json);
    } catch {}
    if (ids.length === 0) return "All booking types";
    const names = ids.map((i) => titles.get(i)).filter(Boolean) as string[];
    return names.length <= 2 ? names.join(", ") : `${names.length} booking types`;
  };

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <p className="mt-1 text-sm text-stone-500">Emails that go out by themselves: reminders, thank-yous, follow-ups and more. Text messages can be added later.</p>
        </div>
        <Link href="/admin/workflows/new" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">New automation</Link>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 border-b-2 border-[#151B1F] pb-2 text-lg font-semibold">Your automations</h2>
        {workflows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">No automations yet. Start from one of the templates below.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl bg-white ring-1 ring-stone-200">
            {workflows.map((w, i) => (
              <li key={w.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${i ? "border-t border-stone-200" : ""}`}>
                <Link href={`/admin/workflows/${w.id}`} className="min-w-0 flex-1 basis-72">
                  <span className="block font-medium hover:underline">{w.name}</span>
                  <span className="mt-0.5 block text-sm text-stone-500">{describe(w)}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-stone-600">
                    <span className="rounded-md bg-stone-100 px-2 py-0.5">✉ Email</span>
                    <span className="rounded-md bg-stone-100 px-2 py-0.5">{scope(w.eventTypeIds)}</span>
                    <span className="rounded-md bg-stone-100 px-2 py-0.5">Sent {w._count.sends} time{w._count.sends === 1 ? "" : "s"}</span>
                  </span>
                </Link>
                <WorkflowSwitch id={w.id} active={w.active} name={w.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-1 border-b-2 border-[#151B1F] pb-2 text-lg font-semibold">Start from a template</h2>
        <p className="mb-4 mt-2 text-sm text-stone-500">Pick one, adjust the wording and timing, then save. Nothing is sent until you save it.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <Link key={t.key} href={`/admin/workflows/new?template=${t.key}`} className="rounded-xl bg-white p-4 ring-1 ring-stone-200 transition hover:ring-2 hover:ring-[var(--brand)]">
              <span className="text-xs font-medium uppercase tracking-wide text-stone-500">{describe(t)}</span>
              <span className="mt-1 block font-medium">{t.name}</span>
              <span className="mt-1 block text-sm text-stone-500">{t.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">Built-in emails</h2>
        <p className="mt-3 text-sm text-stone-600">
          Booking confirmations, reschedule and cancellation emails always go out (to the client and to you) with the calendar invite.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-4">
          <div className="min-w-0">
            <p className="font-medium">Standard reminders: 24 hours and 1 hour before</p>
            <p className="text-sm text-stone-500">Turn these off if you use your own reminder automations above, so clients don&apos;t get two.</p>
          </div>
          <BuiltInSwitch on={settings.builtInReminders} />
        </div>
      </section>
    </div>
  );
}
