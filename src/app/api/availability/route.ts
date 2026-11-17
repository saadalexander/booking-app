import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { findNextAvailableDate, getAvailability, getEventTypeBySlug, isValidTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";

/** GET /api/availability?slug=…&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City[&reschedule=token] */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const tz = url.searchParams.get("tz") ?? "UTC";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const reschedule = url.searchParams.get("reschedule");

  if (!isValidTimezone(tz)) return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
  const a = DateTime.fromISO(from);
  const b = DateTime.fromISO(to);
  if (!a.isValid || !b.isValid || b < a || b.diff(a, "days").days > 62) {
    return NextResponse.json({ error: "Invalid date range (max 62 days)" }, { status: 400 });
  }

  const et = await getEventTypeBySlug(slug);
  if (!et) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let excludeBookingId: string | undefined;
  if (reschedule) {
    const prev = await prisma.booking.findUnique({ where: { manageToken: reschedule }, select: { id: true } });
    excludeBookingId = prev?.id;
  }

  let days, nextAvailable;
  try {
    days = await getAvailability(et, from, to, tz, { excludeBookingId });
    nextAvailable = days.some((d) => d.status === "available") ? null : await findNextAvailableDate(et, tz);
  } catch (e) {
    console.error("availability failed", e);
    return NextResponse.json({ error: "Couldn't check the calendar just now — please try again in a moment." }, { status: 503 });
  }
  return NextResponse.json(
    { timezone: et.lockTimezone ? et.schedule.timezone : tz, days, nextAvailable },
    { headers: { "Cache-Control": "no-store" } },
  );
}
