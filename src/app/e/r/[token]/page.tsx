import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { whenText } from "@/lib/group-events";
import { brandStyle, getSettings } from "@/lib/settings";
import CancelForm from "./CancelForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your registration" };

export default async function RegistrationPage({ params }: PageProps<"/e/r/[token]">) {
  const { token } = await params;
  const r = await prisma.eventRegistration.findUnique({ where: { manageToken: token }, include: { event: true } });
  if (!r) notFound();
  const settings = await getSettings();
  const over = r.event.startUtc <= new Date();
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12" style={brandStyle(settings.brandColor)}>
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand)]">Your registration</p>
        <h1 className="mt-1 text-2xl font-semibold">{r.event.title}</h1>
        <p className="mt-2 text-sm text-stone-600">{whenText(r.event, r.timezone)}</p>
        <p className="mt-1 text-sm text-stone-600">Registered as {r.name} ({r.email})</p>
        <div className="mt-6">
          {r.event.status === "cancelled" ? (
            <p className="text-sm text-stone-700">This event has been cancelled.</p>
          ) : r.status === "cancelled" ? (
            <p className="text-sm text-stone-700">Your place is cancelled. <Link className="underline" href={`/e/${r.event.slug}`}>Register again</Link></p>
          ) : over ? (
            <p className="text-sm text-stone-700">This event has already started.</p>
          ) : (
            <CancelForm token={token} />
          )}
        </div>
      </div>
    </main>
  );
}
