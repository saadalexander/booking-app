import Link from "next/link";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  const sp = await searchParams;
  const q = typeof sp.email === "string" ? sp.email : typeof sp.q === "string" ? sp.q : "";
  const settings = await getSettings();
  const clients = await prisma.client.findMany({
    where: q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { bookings: { orderBy: { startUtc: "desc" }, include: { eventType: { select: { title: true } } } } },
  });
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Contacts</h1>
      <form className="mt-4">
        <input name="q" defaultValue={q} placeholder="Search name or email" className="input max-w-sm" />
      </form>
      {clients.length === 0 && <p className="mt-8 text-stone-500">No clients yet.</p>}
      <ul className="mt-6 space-y-3">
        {clients.map((c) => (
          <li key={c.id} className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{c.name}</span>
              <span className="text-sm text-stone-500">{c.email}{c.phone ? ` · ${c.phone}` : ""}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {c.bookings.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                    <span className={b.status === "cancelled" ? "text-stone-400 line-through" : ""}>
                      {DateTime.fromJSDate(b.startUtc, { zone: settings.timezone }).toFormat("d LLL yyyy, h:mm a")} — {b.eventType.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
