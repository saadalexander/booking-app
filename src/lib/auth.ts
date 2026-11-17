/**
 * Owner sign-in for /admin. Single password from ADMIN_PASSWORD; session is an HMAC-signed,
 * expiring cookie. Checked in proxy.ts (fast redirect) AND in every admin page/action/route.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "hb_admin";
const SESSION_DAYS = 14;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionValue(now = Date.now()) {
  const exp = now + SESSION_DAYS * 86_400_000;
  return { value: `${exp}.${sign(`admin:${exp}`)}`, maxAge: SESSION_DAYS * 86_400 };
}

export function isValidSession(value: string | undefined | null, now = Date.now()) {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  const expected = Buffer.from(sign(`admin:${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function checkPassword(candidate: string) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}
