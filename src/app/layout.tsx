import type { Metadata } from "next";
import { DM_Sans, Poppins } from "next/font/google";
import "./globals.css";
import { connection } from "next/server";
import { prisma } from "@/lib/db";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["500"] });

/** Page titles use the business name from Settings ("Book a time — Your Business"). */
export async function generateMetadata(): Promise<Metadata> {
  await connection(); // read at request time, never while building (the database isn't available then)
  const s = await prisma.settings.findUnique({ where: { id: 1 }, select: { businessName: true, ownerName: true } }).catch(() => null);
  const name = s?.businessName || "Bookings";
  return {
    title: { default: `Book a time — ${name}`, template: `%s — ${name}` },
    description: s ? `Book a time with ${s.ownerName}.` : "Book a time.",
    robots: { index: false },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${dmSans.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-stone-900">{children}</body>
    </html>
  );
}
