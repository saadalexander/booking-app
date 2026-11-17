import { notFound } from "next/navigation";
import Booker from "@/components/BookerClient";
import { getEventTypeBySlug } from "@/lib/availability";
import { toBookerEventType } from "@/lib/booker-props";
import { prisma } from "@/lib/db";
import { brandStyle, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Private booking link" };

/** Single-use private link: works once, then expires. */
export default async function PrivateLinkPage({ params }: PageProps<"/l/[token]">) {
  const { token } = await params;
  const link = await prisma.singleUseLink.findUnique({ where: { token }, include: { eventType: { select: { slug: true } } } });
  if (!link) notFound();
  const settings = await getSettings();
  if (link.usedAt) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">This private link has already been used</h1>
        <p className="mt-2 text-stone-600">Please ask {settings.ownerName} for a new link.</p>
      </main>
    );
  }
  const et = await getEventTypeBySlug(link.eventType.slug);
  if (!et) notFound();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8" style={brandStyle(settings.brandColor)}>
      <Booker eventType={toBookerEventType(et)} businessName={settings.businessName} ownerName={settings.ownerName} linkToken={token} />
    </main>
  );
}
