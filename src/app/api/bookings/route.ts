import { NextResponse } from "next/server";
import { BookingError, bookingInput, createBooking } from "@/lib/bookings";

/**
 * POST /api/bookings — multipart form:
 *   payload: JSON (see bookingInput)
 *   file:<questionKey>: one or more files
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const raw = form.get("payload");
  let json: unknown;
  try {
    json = JSON.parse(typeof raw === "string" ? raw : "");
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = bookingInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("\n") }, { status: 400 });
  }

  const files = new Map<string, File[]>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("file:") || typeof value === "string" || value.size === 0) continue;
    const q = key.slice(5);
    files.set(q, [...(files.get(q) ?? []), value]);
  }

  try {
    const booking = await createBooking(parsed.data, files);
    return NextResponse.json({ manageToken: booking.manageToken }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
