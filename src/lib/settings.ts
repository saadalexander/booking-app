import { redirect } from "next/navigation";
import { prisma } from "./db";

/** Settings, or null on a brand-new copy that hasn't been through the welcome screen yet. */
export function findSettings() {
  return prisma.settings.findUnique({ where: { id: 1 } });
}

export async function getSettings() {
  const s = await findSettings();
  // A new copy: the owner fills in the basics on the dashboard's welcome screen (after signing in).
  if (!s) redirect("/admin/welcome");
  return s;
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type Consent = { key: string; label: string; required: boolean };

export const LOCATION_LABELS: Record<string, string> = {
  google_meet: "Google Meet video call",
  zoom: "Zoom video call",
  phone: "Phone call",
  in_person: "In person",
};

export { changeWindowHours } from "./policy";

/** CSS variables for the brand colour, plus a readable text colour for use on top of it. */
export function brandStyle(hex: string): Record<string, string> {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { "--brand": hex, "--brand-ink": luminance > 0.36 ? "#151B1F" : "#ffffff" };
}
