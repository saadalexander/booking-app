import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { appUrl, getSettings } from "@/lib/settings";
import { createPrivateLink } from "../../actions";

export default async function LinksPage() {
  const settings = await getSettings();
  const [eventTypes, links] = await Promise.all([
    prisma.eventType.findMany({ orderBy: { position: "asc" }, select: { id: true, title: true } }),
    prisma.singleUseLink.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { eventType: { select: { title: true } } } }),
  ]);
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Private links</h1>
      <p className="mt-1 text-sm text-stone-600">One-time links for a specific client — e.g. a re-book or a hidden booking type. Each link works once.</p>
      <form action={createPrivateLink} className="mt-6 grid gap-3 rounded-xl bg-white p-5 ring-1 ring-stone-200 sm:grid-cols-[1fr_1fr_auto]">
        <select name="eventTypeId" className="input" required>
          {eventTypes.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <input name="note" className="input" placeholder="Note (e.g. client name)" />
        <button className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">Create link</button>
      </form>
      <ul className="mt-6 space-y-2">
        {links.map((l) => (
          <li key={l.id} className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{l.eventType.title}</span>
              <span className={`text-xs ${l.usedAt ? "text-stone-400" : "text-emerald-700"}`}>
                {l.usedAt ? `Used ${DateTime.fromJSDate(l.usedAt, { zone: settings.timezone }).toFormat("d LLL")}` : "Unused"}
              </span>
            </div>
            {l.note && <p className="text-sm text-stone-500">{l.note}</p>}
            <input readOnly className="input mt-2 font-mono text-xs" value={`${appUrl()}/l/${l.token}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
