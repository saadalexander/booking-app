import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, SESSION_COOKIE } from "./auth";

/** Call at the top of every admin page, server action and admin route handler. */
export async function requireAdmin() {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) redirect("/admin/login");
}

export async function isAdmin() {
  const jar = await cookies();
  return isValidSession(jar.get(SESSION_COOKIE)?.value);
}
