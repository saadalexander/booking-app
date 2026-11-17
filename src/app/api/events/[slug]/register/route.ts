import { NextResponse } from "next/server";
import { EventError, register, registrationSchema } from "@/lib/group-events";

/** POST /api/events/:slug/register  { name, email, phone?, timezone? } */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = registrationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("\n") }, { status: 400 });
  try {
    const { registration, already } = await register(slug, parsed.data);
    return NextResponse.json({ manageToken: registration.manageToken, already }, { status: already ? 200 : 201 });
  } catch (e) {
    if (e instanceof EventError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("event registration failed", e);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
