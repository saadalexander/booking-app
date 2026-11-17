import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { runRemindersNow } from "../../actions";

export default async function OutboxPage() {
  const settings = await getSettings();
  const emails = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Email outbox</h1>
        <form action={runRemindersNow}>
          <button className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 hover:ring-[var(--brand)]">Send due reminders now</button>
        </form>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Phase 1: emails are recorded here instead of being sent. Connecting an email provider (phase 2) sends them for real.
      </p>
      {emails.length === 0 && <p className="mt-8 text-stone-500">No emails yet.</p>}
      <ul className="mt-6 space-y-3">
        {emails.map((e) => (
          <li key={e.id}>
            <details className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
              <summary className="cursor-pointer">
                <span className="font-medium">{e.subject}</span>
                <span className="block text-xs text-stone-500">
                  To {e.to} · {e.kind.replace(/_/g, " ")} · {DateTime.fromJSDate(e.createdAt, { zone: settings.timezone }).toFormat("d LLL, h:mm a")}
                </span>
              </summary>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-stone-700">{e.body}</pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
