"use server";

import { cancelRegistration, EventError, register, registrationSchema } from "@/lib/group-events";

export type RegisterState = { error?: string; done?: { already: boolean; manageToken: string; email: string } } | undefined;

export async function registerForEvent(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const slug = String(formData.get("slug") ?? "");
  const parsed = registrationSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    timezone: formData.get("timezone") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("\n") };
  try {
    const { registration, already } = await register(slug, parsed.data);
    return { done: { already, manageToken: registration.manageToken, email: registration.email } };
  } catch (e) {
    if (e instanceof EventError) return { error: e.message };
    console.error("event registration failed", e);
    return { error: "Something went wrong — please try again." };
  }
}

export async function cancelMyRegistration(_prev: { error?: string; done?: boolean } | undefined, formData: FormData) {
  try {
    await cancelRegistration(String(formData.get("token") ?? ""));
    return { done: true };
  } catch (e) {
    return { error: e instanceof EventError ? e.message : "Something went wrong — please try again." };
  }
}
