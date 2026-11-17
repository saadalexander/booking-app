"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { isValidTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { cancelWholeEvent, syncEventToGoogle, whenText } from "@/lib/group-events";
import { appUrl } from "@/lib/settings";

const eventSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title").max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/, "Link: lowercase letters, numbers and dashes").max(80),
  description: z.string().max(20000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  durationMinutes: z.preprocess(Number, z.number().int().min(5, "At least 5 minutes").max(24 * 60)),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  locationType: z.enum(["google_meet", "online_link", "in_person"]),
  locationDetail: z.string().trim().max(500).optional(),
  capacity: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1, "Seats must be at least 1").max(100000).nullable()),
  status: z.enum(["draft", "published"]),
});

export async function saveEvent(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = eventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("\n") };
  const d = parsed.data;
  const start = DateTime.fromISO(`${d.date}T${d.time}`, { zone: d.timezone });
  if (!start.isValid) return { error: "That date and time doesn't exist in this timezone" };
  const existing = id ? await prisma.groupEvent.findUnique({ where: { id } }) : null;
  if (!existing && start.toMillis() < Date.now()) return { error: "Pick a date in the future" };
  const clash = await prisma.groupEvent.findUnique({ where: { slug: d.slug } });
  if (clash && clash.id !== id) return { error: `The link /e/${d.slug} is already used by “${clash.title}”` };
  const bookingClash = await prisma.eventType.findUnique({ where: { slug: d.slug } });
  if (bookingClash) return { error: `The link ${d.slug} is used by a booking type — pick another` };
  if (existing && d.capacity != null) {
    const taken = await prisma.eventRegistration.count({ where: { eventId: id, status: "registered" } });
    if (d.capacity < taken) return { error: `${taken} people are already registered, so seats can't be fewer than ${taken}` };
  }

  const data = {
    title: d.title,
    slug: d.slug,
    description: d.description.replace(/\r\n?/g, "\n"),
    startUtc: start.toJSDate(),
    endUtc: start.plus({ minutes: d.durationMinutes }).toJSDate(),
    timezone: d.timezone,
    locationType: d.locationType,
    locationDetail: d.locationDetail || null,
    capacity: d.capacity,
    status: existing?.status === "cancelled" ? "cancelled" : d.status,
  };
  const saved = existing ? await prisma.groupEvent.update({ where: { id }, data }) : await prisma.groupEvent.create({ data });

  // Tell registrants if the time moved.
  if (existing && existing.startUtc.getTime() !== saved.startUtc.getTime() && saved.status === "published") {
    const regs = await prisma.eventRegistration.findMany({ where: { eventId: id, status: "registered" } });
    for (const r of regs) {
      await sendEmail(r.email, `New time: ${saved.title}`, [`Hi ${r.name.split(/\s+/)[0]},`, ``, `${saved.title} has moved to ${whenText(saved, r.timezone)}.`, ``, `Can't make the new time? You can cancel here: ${appUrl()}/e/r/${r.manageToken}`].join("\n"), "event_moved");
    }
  }
  if (saved.status === "published") await syncEventToGoogle(saved.id);
  revalidatePath("/admin/events");
  revalidatePath("/");
  if (!id) redirect(`/admin/events/${saved.id}?saved=1`);
  return { ok: true };
}

export async function cancelEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000) || null;
  await cancelWholeEvent(id, reason);
  revalidatePath("/admin/events");
  revalidatePath("/");
  redirect(`/admin/events/${id}`);
}

export async function removeRegistration(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const r = await prisma.eventRegistration.update({ where: { id }, data: { status: "cancelled" } });
  revalidatePath(`/admin/events/${r.eventId}`);
}

/** Deletes a draft or an event nobody registered for. */
export async function deleteGroupEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const regs = await prisma.eventRegistration.count({ where: { eventId: id } });
  if (regs > 0) redirect(`/admin/events/${id}?error=has-registrations`);
  const ev = await prisma.groupEvent.update({ where: { id }, data: { status: "cancelled" } });
  await syncEventToGoogle(ev.id);
  await prisma.groupEvent.delete({ where: { id } });
  revalidatePath("/admin/events");
  revalidatePath("/");
  redirect("/admin/events");
}
