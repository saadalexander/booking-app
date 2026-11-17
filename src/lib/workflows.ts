/**
 * Automations ("workflows", as Cal.com calls them): emails sent when a booking is made,
 * moved or cancelled, or a set time before it starts / after it ends.
 *
 * Every send is recorded in WorkflowSend first (unique per automation + booking), so an
 * automation never goes out twice for the same booking, even if two cron runs overlap.
 * Only bookings made in this app get automations; imported ones (source = "cal.com") are skipped.
 * Timed automations never backfill: a send whose moment came before the automation existed
 * (or before the booking was made) is skipped.
 */
import { prisma } from "./db";
import { emailVariables, sendEmail } from "./email";
import { getSettings } from "./settings";

export { describe, INSTANT, render, sampleVariables, TEMPLATES, TIMED, TRIGGERS, VARIABLES, type Trigger } from "./workflow-text";
import { render, TIMED } from "./workflow-text";

const include = {
  client: { select: { name: true, email: true, phone: true } },
  eventType: { select: { title: true, slug: true, neutralTitle: true, durationMinutes: true, locationType: true, locationDetail: true, cancelWindowHours: true, minNoticeMinutes: true } },
} as const;

type WorkflowRow = Awaited<ReturnType<typeof prisma.workflow.findMany>>[number];

function appliesTo(w: WorkflowRow, eventTypeId: string) {
  let ids: string[] = [];
  try {
    ids = JSON.parse(w.eventTypeIds);
  } catch {}
  return ids.length === 0 || ids.includes(eventTypeId);
}

/** Records then sends one automation for one booking. Returns false if it was already sent. */
async function sendOnce(w: WorkflowRow, bookingId: string) {
  try {
    await prisma.workflowSend.create({ data: { workflowId: w.id, bookingId } });
  } catch {
    return false; // already sent (unique workflow + booking)
  }
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include });
  if (!b) return false;
  const vars = await emailVariables(b as unknown as Parameters<typeof emailVariables>[0]);
  const to = w.recipient === "owner" ? (await getSettings()).ownerEmail : b.client.email;
  await sendEmail(to, render(w.subject, vars), render(w.body, vars), `automation:${w.name}`.slice(0, 80), b.id);
  return true;
}

/** Runs the instant automations for a booking that was just made, moved or cancelled. Never throws. */
export async function runInstantWorkflows(bookingId: string, trigger: "booking_created" | "booking_rescheduled" | "booking_cancelled") {
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { eventTypeId: true, source: true } });
    if (!b || b.source) return 0; // imported bookings (e.g. from Cal.com) are left to the old system
    const flows = (await prisma.workflow.findMany({ where: { active: true, trigger } })).filter((w) => appliesTo(w, b.eventTypeId));
    let sent = 0;
    for (const w of flows) if (await sendOnce(w, bookingId)) sent++;
    return sent;
  } catch (e) {
    console.error("automations failed", e);
    return 0;
  }
}

/** Sends every timed automation that is due. Safe to run repeatedly (the cron runs it every 10 minutes). */
export async function runTimedWorkflows(now = new Date()) {
  const flows = await prisma.workflow.findMany({ where: { active: true, trigger: { in: TIMED } } });
  let sent = 0;
  for (const w of flows) {
    const offset = w.offsetMinutes * 60_000;
    // A due moment is never earlier than the automation itself (no backfilling old bookings).
    const candidates =
      w.trigger === "before_start"
        ? await prisma.booking.findMany({
            where: { status: "confirmed", source: null, startUtc: { gt: now, lte: new Date(now.getTime() + offset) }, workflowSends: { none: { workflowId: w.id } } },
            select: { id: true, eventTypeId: true, startUtc: true, endUtc: true, createdAt: true },
          })
        : await prisma.booking.findMany({
            where: {
              status: "confirmed",
              source: null,
              endUtc: { lte: new Date(now.getTime() - offset), gte: new Date(Math.max(w.createdAt.getTime(), now.getTime() - 3 * 86_400_000) - offset) },
              workflowSends: { none: { workflowId: w.id } },
            },
            select: { id: true, eventTypeId: true, startUtc: true, endUtc: true, createdAt: true },
          });
    for (const b of candidates) {
      if (!appliesTo(w, b.eventTypeId)) continue;
      const due = w.trigger === "before_start" ? b.startUtc.getTime() - offset : b.endUtc.getTime() + offset;
      if (due < w.createdAt.getTime()) continue; // the moment passed before this automation existed
      // Booked after the reminder moment (e.g. a 24 h reminder for a call booked 3 h ahead): skip.
      if (w.trigger === "before_start" && b.createdAt.getTime() > due) continue;
      if (await sendOnce(w, b.id)) sent++;
    }
  }
  return { automations: flows.length, sent };
}

