import { prisma } from "@/lib/db";
import { icsFile } from "@/lib/group-events";
import { getSettings } from "@/lib/settings";

/** Calendar file for Apple Calendar / Outlook. The joining link is only in the emails. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ev = await prisma.groupEvent.findUnique({ where: { slug } });
  if (!ev || ev.status !== "published") return new Response("Not found", { status: 404 });
  const s = await getSettings();
  // The public file leaves out the Meet link (registrants get it by email).
  const body = icsFile({ ...ev, meetUrl: null }, s);
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${ev.slug}.ics"` },
  });
}
