"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { testMailerliteKey } from "@/lib/mailerlite";

export async function saveMailerliteKey(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const key = String(formData.get("key") ?? "").trim();
  if (key.length < 20) return { error: "That doesn't look like a MailerLite API key." };
  if (!(await testMailerliteKey(key))) return { error: "MailerLite didn't accept that key. Check it and try again." };
  await prisma.settings.update({ where: { id: 1 }, data: { mailerliteKey: encrypt(key) } });
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function removeMailerliteKey() {
  await requireAdmin();
  await prisma.settings.update({ where: { id: 1 }, data: { mailerliteKey: null } });
  revalidatePath("/admin/integrations");
}
