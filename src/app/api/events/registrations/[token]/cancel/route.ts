import { NextResponse } from "next/server";
import { cancelRegistration, EventError } from "@/lib/group-events";

/** POST /api/events/registrations/:token/cancel */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    await cancelRegistration(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof EventError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
