import Link from "next/link";
import { prisma } from "@/lib/db";
import { getConnection } from "@/lib/google";
import { appUrl } from "@/lib/settings";
import CopyButton from "./events/[id]/CopyButton";

/** Shown on the dashboard home until a new copy has Google connected and a booking type. */
export default async function GettingStarted() {
  const [conn, types] = await Promise.all([getConnection(), prisma.eventType.count({ where: { hidden: false } })]);
  if (conn && types > 0) return null;
  const steps = [
    { done: Boolean(conn), title: "Connect Google", text: "So bookings go into your calendar with a Meet link, busy times are blocked, and emails send from your Gmail.", href: "/admin/integrations", cta: "Open Google & email" },
    { done: types > 0, title: "Create your first booking type", text: "The name, length, hours and questions for a session clients can book.", href: "/admin/event-types/new", cta: "Create a booking type" },
  ];
  return (
    <section className="mb-8 rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="font-semibold">Getting started</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="text-sm">
              <p className={`font-medium ${s.done ? "text-stone-500 line-through" : ""}`}>{s.title}</p>
              {!s.done && (
                <>
                  <p className="text-stone-600">{s.text}</p>
                  <Link href={s.href} className="mt-1 inline-block font-medium text-[var(--brand)] underline">{s.cta}</Link>
                </>
              )}
            </div>
          </li>
        ))}
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-700">3</span>
          <div className="text-sm">
            <p className="font-medium">Share your booking page</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all text-stone-700">{appUrl()}</code>
              <CopyButton text={appUrl()} label="Copy link" />
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
