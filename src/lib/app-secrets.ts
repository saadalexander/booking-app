import "server-only";
import { prisma } from "./db";

/**
 * Google OAuth client: from the environment (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) or, for
 * copies set up without Terminal, from what the owner pasted on the dashboard's Google page.
 */
export async function googleClient(): Promise<{ id: string; secret: string } | null> {
  const envId = process.env.GOOGLE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (envId && envSecret) return { id: envId, secret: envSecret };
  const rows = await prisma.appSecret.findMany({ where: { name: { in: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] } } });
  const get = (n: string) => rows.find((r) => r.name === n)?.value.trim() || "";
  const id = envId || get("GOOGLE_CLIENT_ID");
  const secret = envSecret || get("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret } : null;
}

/** True when the Google client comes from Cloudflare / .env (so the dashboard form isn't needed). */
export function googleClientFromEnv() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export async function saveGoogleClient(id: string, secret: string) {
  for (const [name, value] of [["GOOGLE_CLIENT_ID", id], ["GOOGLE_CLIENT_SECRET", secret]] as const) {
    await prisma.appSecret.upsert({ where: { name }, create: { name, value }, update: { value } });
  }
}

export async function removeGoogleClient() {
  await prisma.appSecret.deleteMany({ where: { name: { in: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] } } });
}
