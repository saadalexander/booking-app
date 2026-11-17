import Link from "next/link";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/settings";
import { deleteCategory, moveCategory } from "../../actions";
import CategoryForm from "./CategoryForm";
import BookingTypeBoard from "./BookingTypeBoard";

function noticeLabel(min: number) {
  if (min === 0) return "no notice";
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"} notice`;
  if (min % 60 === 0) return `${min / 60} h notice`;
  return `${min} min notice`;
}

export default async function EventTypesPage() {
  const [eventTypes, categories] = await Promise.all([
    prisma.eventType.findMany({
      orderBy: { position: "asc" },
      include: { schedule: { select: { name: true, customForEventTypeId: true } }, _count: { select: { bookings: true, questions: true } } },
    }),
    prisma.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);
  const base = appUrl();

  return (
    <div className="max-w-[1600px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Booking types</h1>
          <p className="mt-1 text-sm text-stone-500">
            {eventTypes.length} booking types in {categories.length} categories · {eventTypes.filter((e) => e.source === "cal.com").length} imported from Cal.com
          </p>
        </div>
        <Link href="/admin/event-types/new" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">New booking type</Link>
      </div>

      <BookingTypeBoard
        key={eventTypes.map((e) => `${e.id}:${e.categoryId}:${e.position}:${e.hidden}:${e.title}`).join("|") + categories.map((c) => c.id + c.name).join("|")}
        baseUrl={base}
        groups={[...categories.map((c) => ({ id: c.id, name: c.name, description: c.description })), { id: null, name: "Uncategorised", description: "" }]}
        rows={eventTypes.map((et) => ({
          id: et.id,
          title: et.title,
          slug: et.slug,
          hidden: et.hidden,
          categoryId: et.categoryId,
          durationMinutes: et.durationMinutes,
          hoursLabel: et.schedule.customForEventTypeId ? "Custom hours" : et.schedule.name,
          noticeLabel: noticeLabel(et.minNoticeMinutes),
          seats: et.seats,
          bookings: et._count.bookings,
        }))}
      />

      <section id="categories" className="mt-12 scroll-mt-6 rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">Categories</h2>
        <p className="mt-3 text-sm text-stone-500">Group your booking types by process. They show in this order on your dashboard and booking page. Deleting a category keeps its booking types (they become uncategorised).</p>
        <ul className="mt-4 space-y-3">
          {categories.map((c, i) => (
            <li key={c.id} className="rounded-lg border border-stone-200 p-3">
              <CategoryForm id={c.id} name={c.name} description={c.description} />
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button disabled={i === 0} className="rounded-md px-2 py-1 ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-40">↑ Move up</button>
                </form>
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button disabled={i === categories.length - 1} className="rounded-md px-2 py-1 ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-40">↓ Move down</button>
                </form>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="rounded-md px-2 py-1 text-red-700 ring-1 ring-stone-200 hover:bg-red-50">Delete</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-stone-100 pt-4">
          <p className="mb-2 text-sm font-medium">Add a category</p>
          <CategoryForm />
        </div>
      </section>
    </div>
  );
}
