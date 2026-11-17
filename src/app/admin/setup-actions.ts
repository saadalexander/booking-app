"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { removeGoogleClient, saveGoogleClient } from "@/lib/app-secrets";
import { isValidTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/settings";

// ---------- welcome screen (first sign-in on a new copy) ----------

const welcomeSchema = z.object({
  businessName: z.string().trim().min(1, "Add your business name").max(120),
  ownerName: z.string().trim().min(1, "Add your first name").max(80),
  ownerEmail: z.string().trim().email("That email address doesn't look right"),
  timezone: z.string().refine(isValidTimezone, "Pick your timezone from the list"),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a brand colour"),
});

export async function completeWelcome(_prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const parsed = welcomeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("\n") };
  const d = parsed.data;
  const siteUrl = appUrl().startsWith("http://localhost") ? null : appUrl();
  // No interactive transactions on D1: create Settings first (a double submit fails here and stops).
  try {
    await prisma.settings.create({ data: { id: 1, ...d, siteUrl } });
  } catch {
    redirect("/admin");
  }
  if (!(await prisma.schedule.count())) {
    await prisma.schedule.create({
      data: {
        name: "Working hours",
        timezone: d.timezone,
        isDefault: true,
        rules: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })) },
      },
    });
  }
  revalidatePath("/", "layout");
  redirect("/admin?welcome=1");
}

// ---------- Google OAuth client, pasted on the Google & email page ----------

export async function saveGoogleClientKeys(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("clientId") ?? "").trim();
  const secret = String(formData.get("clientSecret") ?? "").trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) return { error: "The Client ID should end in .apps.googleusercontent.com" };
  if (secret.length < 15 || /\s/.test(secret)) return { error: "That Client secret doesn't look right. It usually starts with GOCSPX-" };
  await saveGoogleClient(id, secret);
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function removeGoogleClientKeys() {
  await requireAdmin();
  await removeGoogleClient();
  revalidatePath("/admin/integrations");
}
