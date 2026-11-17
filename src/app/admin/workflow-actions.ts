"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { appUrl, getSettings } from "@/lib/settings";
import { render, sampleVariables, TRIGGERS, type Trigger } from "@/lib/workflows";

const workflowSchema = z.object({
  name: z.string().trim().min(1, "Give the automation a name").max(120),
  active: z.boolean(),
  trigger: z.enum(Object.keys(TRIGGERS) as [Trigger, ...Trigger[]]),
  offsetMinutes: z.number().int().min(0).max(60 * 24 * 90),
  recipient: z.enum(["client", "owner"]),
  subject: z.string().trim().min(1, "Add a subject").max(300),
  body: z.string().trim().min(1, "Write the email").max(10000),
  eventTypeIds: z.array(z.string()).max(200),
});
export type WorkflowInput = z.infer<typeof workflowSchema>;

function parse(formData: FormData) {
  const amount = Number(formData.get("offsetAmount") ?? 0);
  const unit = Number(formData.get("offsetUnit") ?? 60);
  return workflowSchema.safeParse({
    name: formData.get("name") ?? "",
    active: formData.get("active") === "on",
    trigger: formData.get("trigger"),
    offsetMinutes: Math.round((Number.isFinite(amount) ? amount : 0) * unit),
    recipient: formData.get("recipient"),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? "").replace(/\r\n?/g, "\n"),
    eventTypeIds: formData.get("scope") === "some" ? formData.getAll("eventTypeIds").map(String) : [],
  });
}

export async function saveWorkflow(_prev: { error?: string; ok?: boolean; tested?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("\n") };
  const d = parsed.data;
  if (d.trigger === "before_start" && d.offsetMinutes < 5) {
    return { error: "Send it at least 5 minutes before the start." };
  }
  if (formData.get("scope") === "some" && d.eventTypeIds.length === 0) return { error: "Pick at least one booking type, or choose “All booking types”." };
  const data = { ...d, offsetMinutes: d.trigger === "before_start" || d.trigger === "after_end" ? d.offsetMinutes : 0, eventTypeIds: JSON.stringify(d.eventTypeIds) };

  if (formData.get("intent") === "test") {
    const s = await getSettings();
    const vars = sampleVariables({ ...s, baseUrl: appUrl() });
    await sendEmail(s.ownerEmail, `[Test] ${render(d.subject, vars)}`, render(d.body, vars), "automation_test");
    return { tested: s.ownerEmail };
  }

  const saved = id ? await prisma.workflow.update({ where: { id }, data }) : await prisma.workflow.create({ data });
  revalidatePath("/admin/workflows");
  if (!id) redirect(`/admin/workflows/${saved.id}?saved=1`);
  return { ok: true };
}

export async function setWorkflowActive(id: string, active: boolean) {
  await requireAdmin();
  await prisma.workflow.update({ where: { id }, data: { active } });
  revalidatePath("/admin/workflows");
}

export async function deleteWorkflow(formData: FormData) {
  await requireAdmin();
  await prisma.workflow.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/workflows");
  redirect("/admin/workflows");
}

export async function setBuiltInReminders(on: boolean) {
  await requireAdmin();
  await prisma.settings.update({ where: { id: 1 }, data: { builtInReminders: on } });
  revalidatePath("/admin/workflows");
}
