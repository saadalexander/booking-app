"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { checkPassword, createSessionValue, SESSION_COOKIE } from "@/lib/auth";
import { isValidTimezone } from "@/lib/availability";
import { BookingError, cancelBooking, runReminders } from "@/lib/bookings";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/settings";
import { runTimedWorkflows } from "@/lib/workflows";
import { clearBusyCache, disconnect, getConnection, listCalendars } from "@/lib/google";

// ---------- session ----------

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "Wrong password" };
  }
  const { value, maxAge } = createSessionValue();
  (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

// ---------- bookings ----------

export async function ownerCancelBooking(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").slice(0, 1000) || null;
  try {
    await cancelBooking(id, "owner", reason);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
  }
  revalidatePath(`/admin/bookings/${id}`);
  revalidatePath("/admin");
}

export async function runRemindersNow() {
  await requireAdmin();
  await runReminders();
  await runTimedWorkflows();
  revalidatePath("/admin/outbox");
}

// ---------- event types ----------

const questionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(500),
  type: z.enum(["text", "textarea", "select", "multiselect", "phone", "file"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(200)).max(50),
});
const consentSchema = z.object({ key: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(500), required: z.boolean() });

const intOrNull = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).nullable());
const int = z.preprocess((v) => Number(v ?? 0), z.number().int().min(0));
const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const eventTypeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/, "Slug: lowercase letters, numbers and dashes").max(80),
  description: z.string().max(20000),
  durationMinutes: z.preprocess(Number, z.number().int().min(5).max(600)),
  hidden: bool,
  locationType: z.enum(["google_meet", "zoom", "phone", "in_person"]),
  locationDetail: z.string().max(500).optional(),
  scheduleId: z.string().min(1),
  bufferBeforeMinutes: int,
  bufferAfterMinutes: int,
  minNoticeMinutes: int,
  periodType: z.enum(["unlimited", "rolling", "rolling_window", "range"]),
  periodDays: intOrNull,
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  slotIntervalMinutes: intOrNull,
  seats: intOrNull,
  dailyCap: intOrNull,
  firstSlotOnly: bool,
  optimizedSlots: bool,
  lockTimezone: bool,
  allowGuests: bool,
  collectPhone: z.enum(["hidden", "optional", "required"]),
  showNotes: bool,
  neutralTitle: z.string().max(200).optional(),
  cancelWindowHours: intOrNull,
  checklist: z.string().max(5000),
  questions: z.string(),
  consents: z.string(),
  categoryId: z.string().optional(),
  mailerliteGroupId: z.string().trim().regex(/^\d*$/, "MailerLite group: pick one from the list").optional(),
  mailerliteFieldPrefix: z.string().trim().regex(/^[a-z0-9_]*$/, "MailerLite field prefix: lowercase letters, numbers and _ only").max(40).optional(),
});

export async function saveEventType(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = eventTypeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n") };
  const d = parsed.data;
  if (d.locationType === "zoom" && !/^https:\/\/\S+$/.test(d.locationDetail?.trim() ?? "")) {
    return { error: "Add your Zoom meeting link (it starts with https://) under Basics → Your Zoom meeting link." };
  }
  let questions: z.infer<typeof questionSchema>[];
  let consents: z.infer<typeof consentSchema>[];
  try {
    questions = z.array(questionSchema).max(40).parse(JSON.parse(d.questions));
    consents = z.array(consentSchema).max(10).parse(JSON.parse(d.consents));
  } catch {
    return { error: "Questions or consents are invalid" };
  }
  // Browsers submit textareas with CRLF line breaks; store plain \n so saving never rewrites text.
  const lf = (s: string) => s.replace(/\r\n?/g, "\n");
  const checklist = lf(d.checklist).split("\n").map((l) => l.trim()).filter(Boolean);
  const data = {
    title: d.title,
    slug: d.slug,
    description: lf(d.description),
    durationMinutes: d.durationMinutes,
    hidden: d.hidden,
    locationType: d.locationType,
    locationDetail: d.locationDetail || null,
    scheduleId: d.scheduleId,
    bufferBeforeMinutes: d.bufferBeforeMinutes,
    bufferAfterMinutes: d.bufferAfterMinutes,
    minNoticeMinutes: d.minNoticeMinutes,
    periodType: d.periodType,
    periodDays: d.periodDays,
    periodStart: d.periodStart || null,
    periodEnd: d.periodEnd || null,
    slotIntervalMinutes: d.slotIntervalMinutes || null,
    seats: d.seats || null,
    dailyCap: d.dailyCap || null,
    firstSlotOnly: d.firstSlotOnly,
    optimizedSlots: d.optimizedSlots,
    lockTimezone: d.lockTimezone,
    allowGuests: d.allowGuests,
    collectPhone: d.collectPhone,
    showNotes: d.showNotes,
    neutralTitle: d.neutralTitle || null,
    cancelWindowHours: d.cancelWindowHours,
    checklist: JSON.stringify(checklist),
    consents: JSON.stringify(consents),
    categoryId: d.categoryId || null,
    mailerliteGroupId: d.mailerliteGroupId || null,
    mailerliteFieldPrefix: d.mailerliteGroupId && d.mailerliteFieldPrefix ? d.mailerliteFieldPrefix : null,
  };
  const hoursMode = formData.get("hoursMode") === "custom" ? "custom" : "shared";
  let customHours: z.infer<typeof hoursSchema> | null = null;
  if (hoursMode === "custom") {
    const h = hoursSchema.safeParse(JSON.parse(String(formData.get("customHours") ?? "{}")));
    if (!h.success) return { error: "Custom hours: " + h.error.issues.map((i) => i.message).join("; ") };
    if (h.data.rules.length === 0) return { error: "Custom hours: tick at least one day" };
    const bad = hoursProblem(h.data);
    if (bad) return { error: "Custom hours: " + bad };
    customHours = h.data;
  }
  const clash = await prisma.eventType.findUnique({ where: { slug: d.slug } });
  if (clash && clash.id !== id) return { error: `The link /${d.slug} is already used by “${clash.title}”` };

  const saved = id
    ? await prisma.eventType.update({ where: { id }, data })
    : await prisma.eventType.create({ data: { ...data, position: (await prisma.eventType.count()) + 1 } });
  await prisma.$transaction([
    prisma.question.deleteMany({ where: { eventTypeId: saved.id } }),
    prisma.question.createMany({
      data: questions.map((q, i) => ({ eventTypeId: saved.id, key: q.key, label: q.label, type: q.type, required: q.required, options: JSON.stringify(q.options), position: i })),
    }),
  ]);
  await applyHours(saved.id, d.title, d.scheduleId, customHours);
  revalidatePath("/admin/event-types");
  revalidatePath("/admin/schedules");
  if (!id) redirect(`/admin/event-types/${saved.id}?saved=1`);
  return { ok: true };
}

export async function deleteEventType(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const used = await prisma.booking.count({ where: { eventTypeId: id } });
  if (used > 0) {
    await prisma.eventType.update({ where: { id }, data: { hidden: true } });
  } else {
    await prisma.eventType.delete({ where: { id } });
    await prisma.schedule.deleteMany({ where: { customForEventTypeId: id } });
  }
  revalidatePath("/admin/event-types");
  redirect("/admin/event-types");
}

// ---------- custom hours per booking type ----------

/**
 * Points the booking type at a shared schedule, or at its own "custom hours" schedule
 * (created/updated here). Switching back to shared removes the custom schedule.
 */
async function applyHours(eventTypeId: string, title: string, sharedScheduleId: string, custom: z.infer<typeof hoursSchema> | null) {
  const existing = await prisma.schedule.findUnique({ where: { customForEventTypeId: eventTypeId } });
  if (!custom) {
    await prisma.eventType.update({ where: { id: eventTypeId }, data: { scheduleId: sharedScheduleId } });
    if (existing) await prisma.schedule.delete({ where: { id: existing.id } });
    return;
  }
  const name = `${title} (custom hours)`;
  const schedule = existing
    ? await prisma.schedule.update({ where: { id: existing.id }, data: { name, timezone: custom.timezone } })
    : await prisma.schedule.create({ data: { name, timezone: custom.timezone, customForEventTypeId: eventTypeId } });
  await prisma.$transaction([
    prisma.scheduleRule.deleteMany({ where: { scheduleId: schedule.id } }),
    prisma.dateOverride.deleteMany({ where: { scheduleId: schedule.id } }),
    prisma.scheduleRule.createMany({ data: custom.rules.map((r) => ({ ...r, scheduleId: schedule.id })) }),
    prisma.dateOverride.createMany({ data: custom.overrides.map((o) => ({ ...o, scheduleId: schedule.id })) }),
    prisma.eventType.update({ where: { id: eventTypeId }, data: { scheduleId: schedule.id } }),
  ]);
}

// ---------- schedules ----------

const scheduleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  rules: z.array(z.object({ weekday: z.number().int().min(1).max(7), startMinute: z.number().int().min(0).max(1440), endMinute: z.number().int().min(0).max(1440) })).max(70),
  overrides: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMinute: z.number().int().min(0).max(1440).nullable(), endMinute: z.number().int().min(0).max(1440).nullable() })).max(500),
});

const hoursSchema = scheduleSchema.omit({ name: true });

function hoursProblem(h: { rules: { startMinute: number; endMinute: number }[]; overrides: { startMinute: number | null; endMinute: number | null }[] }) {
  if (h.rules.some((r) => r.endMinute <= r.startMinute) || h.overrides.some((o) => o.startMinute != null && o.endMinute != null && o.endMinute <= o.startMinute)) {
    return "each time range must end after it starts";
  }
  return null;
}

export async function saveSchedule(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  let parsed;
  try {
    parsed = scheduleSchema.safeParse(JSON.parse(String(formData.get("payload"))));
  } catch {
    return { error: "Invalid schedule" };
  }
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("\n") };
  const d = parsed.data;
  if (d.rules.some((r) => r.endMinute <= r.startMinute) || d.overrides.some((o) => o.startMinute != null && o.endMinute != null && o.endMinute <= o.startMinute)) {
    return { error: "Each time range must end after it starts" };
  }
  const schedule = id
    ? await prisma.schedule.update({ where: { id }, data: { name: d.name, timezone: d.timezone } })
    : await prisma.schedule.create({ data: { name: d.name, timezone: d.timezone } });
  await prisma.$transaction([
    prisma.scheduleRule.deleteMany({ where: { scheduleId: schedule.id } }),
    prisma.dateOverride.deleteMany({ where: { scheduleId: schedule.id } }),
    prisma.scheduleRule.createMany({ data: d.rules.map((r) => ({ ...r, scheduleId: schedule.id })) }),
    prisma.dateOverride.createMany({ data: d.overrides.map((o) => ({ ...o, scheduleId: schedule.id })) }),
  ]);
  revalidatePath("/admin/schedules");
  if (!id) redirect(`/admin/schedules/${schedule.id}`);
  return { ok: true };
}

// ---------- private links ----------

export async function createPrivateLink(formData: FormData) {
  await requireAdmin();
  const eventTypeId = String(formData.get("eventTypeId"));
  const note = String(formData.get("note") ?? "").slice(0, 200) || null;
  await prisma.singleUseLink.create({ data: { eventTypeId, note, token: randomBytes(12).toString("base64url") } });
  revalidatePath("/admin/links");
}

// ---------- settings ----------

const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(1).max(80),
  ownerEmail: z.string().trim().email(),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must look like #d2402f"),
  tagline: z.string().max(200),
  defaultCancelWindowHours: z.preprocess(Number, z.number().int().min(0).max(720)),
  sidebarStyle: z.enum(["dark", "light"]).default("dark"),
});

export async function saveSettings(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("\n") };
  await prisma.settings.update({ where: { id: 1 }, data: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- Google ----------

export async function saveGoogleCalendars(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const conn = await getConnection();
  if (!conn) return { error: "Google isn't connected" };
  const known = new Set((await listCalendars()).map((c) => c.id));
  const destination = String(formData.get("destination") ?? "");
  const conflicts = formData.getAll("conflict").map(String).filter((id) => known.has(id));
  if (!known.has(destination)) return { error: "Choose a calendar to add bookings to" };
  if (!conflicts.includes(destination)) conflicts.push(destination);
  await prisma.googleConnection.update({ where: { id: 1 }, data: { destinationCalendarId: destination, conflictCalendarIds: JSON.stringify(conflicts) } });
  clearBusyCache();
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function disconnectGoogle() {
  await requireAdmin();
  await disconnect();
  revalidatePath("/admin/integrations");
}

// ---------- booking-type categories ----------

const categorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name").max(80),
  description: z.string().trim().max(300),
});

export async function saveCategory(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = categorySchema.safeParse({ name: formData.get("name") ?? "", description: formData.get("description") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  if (id) await prisma.category.update({ where: { id }, data: parsed.data });
  else await prisma.category.create({ data: { ...parsed.data, position: ((await prisma.category.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1 } });
  revalidatePath("/admin/event-types");
  revalidatePath("/");
  return { ok: true };
}

export async function moveCategory(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const all = await prisma.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  const i = all.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((c, n) => prisma.category.update({ where: { id: c.id }, data: { position: n + 1 } })));
  revalidatePath("/admin/event-types");
  revalidatePath("/");
}

/** Deleting a category keeps its booking types; they move to "Uncategorised". */
export async function deleteCategory(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  await prisma.eventType.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/event-types");
  revalidatePath("/");
}

// ---------- booking-type quick actions (list menu) ----------

export async function setEventTypeCategory(id: string, categoryId: string | null) {
  await requireAdmin();
  await prisma.eventType.update({ where: { id }, data: { categoryId: categoryId || null } });
  revalidatePath("/admin/event-types");
  revalidatePath("/");
}

export async function setEventTypeHidden(id: string, hidden: boolean) {
  await requireAdmin();
  await prisma.eventType.update({ where: { id }, data: { hidden } });
  revalidatePath("/admin/event-types");
  revalidatePath("/");
}

/** One-time private link for a booking type; returns the full URL so the menu can copy it. */
export async function createPrivateLinkFor(eventTypeId: string): Promise<string> {
  await requireAdmin();
  const token = randomBytes(12).toString("base64url");
  await prisma.singleUseLink.create({ data: { eventTypeId, token, note: "Created from booking types" } });
  revalidatePath("/admin/links");
  return `${appUrl()}/l/${token}`;
}

/** Copies a booking type (settings, questions, custom hours) as a hidden draft and opens it. */
export async function duplicateEventType(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const src = await prisma.eventType.findUnique({
    where: { id },
    include: { questions: true, schedule: { include: { rules: true, overrides: true } } },
  });
  if (!src) redirect("/admin/event-types");
  let slug = `${src.slug}-copy`;
  for (let n = 2; await prisma.eventType.findUnique({ where: { slug } }); n++) slug = `${src.slug}-copy-${n}`;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, createdAt: _c, updatedAt: _u, questions, schedule, source: _s, ...fields } = src;
  const copy = await prisma.eventType.create({
    data: { ...fields, slug, title: `${src.title} (copy)`, hidden: true, position: (await prisma.eventType.count()) + 1 },
  });
  if (questions.length) {
    await prisma.question.createMany({
      data: questions.map((q) => ({ key: q.key, label: q.label, type: q.type, required: q.required, options: q.options, position: q.position, eventTypeId: copy.id })),
    });
  }
  if (schedule.customForEventTypeId) {
    await applyHours(copy.id, copy.title, schedule.id, {
      timezone: schedule.timezone,
      rules: schedule.rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
      overrides: schedule.overrides.map((o) => ({ date: o.date, startMinute: o.startMinute, endMinute: o.endMinute })),
    });
  }
  revalidatePath("/admin/event-types");
  redirect(`/admin/event-types/${copy.id}`);
}

/**
 * Moves a booking type into a category (null = uncategorised), placed just before `beforeId`
 * or at the end of that category. Positions are renumbered so the order sticks everywhere.
 */
export async function moveEventType(id: string, categoryId: string | null, beforeId: string | null) {
  await requireAdmin();
  if (categoryId && !(await prisma.category.findUnique({ where: { id: categoryId } }))) return;
  const all = await prisma.eventType.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, categoryId: true } });
  const moving = all.find((e) => e.id === id);
  if (!moving) return;
  const rest = all.filter((e) => e.id !== id);
  moving.categoryId = categoryId;
  let at = beforeId ? rest.findIndex((e) => e.id === beforeId) : -1;
  if (at < 0) {
    const lastInCat = rest.map((e) => e.categoryId ?? null).lastIndexOf(categoryId);
    at = lastInCat >= 0 ? lastInCat + 1 : rest.length;
  }
  rest.splice(at, 0, moving);
  await prisma.$transaction(
    rest.map((e, i) => prisma.eventType.update({ where: { id: e.id }, data: { position: i + 1, ...(e.id === id ? { categoryId } : {}) } })),
  );
  revalidatePath("/admin/event-types");
  revalidatePath("/");
}
