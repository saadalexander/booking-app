import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReminders } from "@/lib/bookings";
import { checkStorageAndWarn } from "@/lib/usage";
import { runTimedWorkflows } from "@/lib/workflows";
import { runEventReminders } from "@/lib/group-events";

/** Called by a scheduler every 5–15 min with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const reminders = await runReminders();
  let automations: { automations: number; sent: number } | { error: string };
  try {
    automations = await runTimedWorkflows();
  } catch (e) {
    console.error("timed automations failed", e);
    automations = { error: e instanceof Error ? e.message : String(e) };
  }
  let events: { sent: number } | { error: string };
  try {
    events = await runEventReminders();
  } catch (e) {
    console.error("event reminders failed", e);
    events = { error: e instanceof Error ? e.message : String(e) };
  }
  const storage = await checkStorageAndWarn();
  return NextResponse.json({ ...reminders, automations, events, storagePercent: Math.round(storage.percent * 10) / 10 });
}
