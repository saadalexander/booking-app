import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { completeConnection } from "@/lib/google";

/** Owner-only: Google redirects here after the owner clicks Allow. */
export async function GET(request: Request) {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/integrations?${q}`, request.url));

  const expected = jar.get("hb_google_state")?.value ?? "";
  const state = url.searchParams.get("state") ?? "";
  jar.delete({ name: "hb_google_state", path: "/api/google" });
  if (!expected || expected.length !== state.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) {
    return back("error=state");
  }
  const err = url.searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(err)}`);
  const code = url.searchParams.get("code");
  if (!code) return back("error=missing-code");

  try {
    await completeConnection(code);
    return back("connected=1");
  } catch (e) {
    console.error("google connect failed", e);
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "connect-failed")}`);
  }
}
