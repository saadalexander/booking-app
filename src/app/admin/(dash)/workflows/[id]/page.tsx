import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { appUrl, getSettings } from "@/lib/settings";
import { TEMPLATES, type Trigger } from "@/lib/workflow-text";
import { deleteWorkflow } from "../../../workflow-actions";
import WorkflowForm, { type WorkflowValues } from "./WorkflowForm";

export const metadata = { title: "Automation" };

export default async function WorkflowPage({ params, searchParams }: PageProps<"/admin/workflows/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const w = isNew ? null : await prisma.workflow.findUnique({ where: { id }, include: { _count: { select: { sends: true } } } });
  if (!isNew && !w) notFound();
  const [settings, categories, eventTypes] = await Promise.all([
    getSettings(),
    prisma.category.findMany({ orderBy: { position: "asc" } }),
    prisma.eventType.findMany({ orderBy: { position: "asc" }, select: { id: true, title: true, categoryId: true } }),
  ]);
  const groups = [
    ...categories.map((c) => ({ name: c.name, types: eventTypes.filter((e) => e.categoryId === c.id) })),
    { name: "Uncategorised", types: eventTypes.filter((e) => !categories.some((c) => c.id === e.categoryId)) },
  ].filter((g) => g.types.length);

  const template = TEMPLATES.find((t) => t.key === sp.template);
  let ids: string[] = [];
  try {
    ids = w ? JSON.parse(w.eventTypeIds) : [];
  } catch {}
  const values: WorkflowValues = w
    ? { id: w.id, name: w.name, active: w.active, trigger: w.trigger as Trigger, offsetMinutes: w.offsetMinutes, recipient: w.recipient as "client" | "owner", subject: w.subject, body: w.body, eventTypeIds: ids }
    : {
        id: "",
        name: template?.name ?? "",
        active: true,
        trigger: template?.trigger ?? "before_start",
        offsetMinutes: template?.offsetMinutes ?? 1440,
        recipient: template?.recipient ?? "client",
        subject: template?.subject ?? "",
        body: template?.body ?? "Hi {first_name},\n\n\n\n{owner_name}",
        eventTypeIds: [],
      };

  return (
    <div className="max-w-6xl">
      <Link href="/admin/workflows" className="text-sm text-stone-500 hover:text-stone-800">← Automations</Link>
      <h1 className="mt-3 text-2xl font-semibold">{isNew ? "New automation" : w!.name}</h1>
      {w && <p className="mt-1 text-sm text-stone-500">Sent {w._count.sends} time{w._count.sends === 1 ? "" : "s"} so far. Changes apply to emails sent from now on.</p>}
      {isNew && <p className="mt-1 text-sm text-stone-500">Only bookings whose send time is still ahead get this — it never emails past bookings.</p>}
      {sp.saved === "1" && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Saved. It&apos;s now running.</p>}
      <WorkflowForm values={values} groups={groups} owner={{ ownerName: settings.ownerName, businessName: settings.businessName, ownerEmail: settings.ownerEmail, baseUrl: appUrl() }} />
      {w && (
        <form action={deleteWorkflow} className="mt-10 border-t border-stone-200 pt-6">
          <input type="hidden" name="id" value={w.id} />
          <button className="text-sm text-red-700 underline">Delete this automation</button>
        </form>
      )}
    </div>
  );
}
