import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/google";
import { getSettings } from "@/lib/settings";

/** Owner-only: start the Google OAuth flow. */
export async function GET(request: Request) {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.redirect(new URL("/admin/integrations?error=not-configured", request.url));
  const state = randomBytes(24).toString("base64url");
  jar.set("hb_google_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/google", maxAge: 600 });
  const settings = await getSettings();
  return NextResponse.redirect(authUrl(state, settings.ownerEmail));
}
