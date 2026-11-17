import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import Booker from "@/components/BookerClient";
import { getEventTypeBySlug } from "@/lib/availability";
import { toBookerEventType } from "@/lib/booker-props";
import { clientCanChange, loadByToken } from "@/lib/bookings";
import { brandStyle, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const et = await getEventTypeBySlug(slug);
  return { title: et?.title ?? "Not found" };
}

export default async function BookingPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const et = await getEventTypeBySlug(slug);
  if (!et) notFound();
  const settings = await getSettings();

  let reschedule: { token: string; name: string; email: string; currentStartLabel: string } | undefined;
  const token = typeof sp.reschedule === "string" ? sp.reschedule : undefined;
  if (token) {
    const prev = await loadByToken(token);
    if (!prev || prev.eventTypeId !== et.id) notFound();
    const policy = await clientCanChange(prev);
    if (!policy.ok) {
      return (
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">This appointment can&apos;t be changed online</h1>
          <p className="mt-2 text-stone-600">Changes need at least {policy.hours} hours&apos; notice. Please get in touch with {settings.ownerName} directly.</p>
        </main>
      );
    }
    reschedule = {
      token,
      name: prev.client.name,
      email: prev.client.email,
      currentStartLabel: DateTime.fromJSDate(prev.startUtc, { zone: prev.timezone }).toFormat("cccc d LLLL, h:mm a"),
    };
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8" style={brandStyle(settings.brandColor)}>
      <Link href="/" className="mb-4 inline-block text-sm text-stone-500 hover:text-stone-800">← All booking types</Link>
      {!reschedule && (
        // Start loading this month's times right away, before the booking widget's code arrives.
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var tz=${JSON.stringify(et.lockTimezone ? et.schedule.timezone : "")}||Intl.DateTimeFormat().resolvedOptions().timeZone;var d=new Date(),y=d.getFullYear(),m=d.getMonth(),p=function(n){return String(n).padStart(2,"0")};var last=new Date(y,m+1,0).getDate();var qs=new URLSearchParams({slug:${JSON.stringify(et.slug)},from:y+"-"+p(m+1)+"-01",to:y+"-"+p(m+1)+"-"+p(last),tz:tz});window.__hbAvail={qs:qs.toString(),at:Date.now(),data:fetch("/api/availability?"+qs,{cache:"no-store"}).then(function(r){return r.json().then(function(b){return{ok:r.ok,body:b}})})}}catch(e){}})()`,
          }}
        />
      )}
      <Booker eventType={toBookerEventType(et)} businessName={settings.businessName} ownerName={settings.ownerName} reschedule={reschedule} />
    </main>
  );
}
