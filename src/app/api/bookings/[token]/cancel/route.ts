import { NextResponse } from "next/server";
import { BookingError, cancelBooking } from "@/lib/bookings";
import { prisma } from "@/lib/db";

/** POST /api/bookings/:token/cancel  { reason?: string } — client self-service cancel. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 1000) : null;
  const booking = await prisma.booking.findUnique({ where: { manageToken: token }, select: { id: true } });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  try {
    await cancelBooking(booking.id, "client", reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
