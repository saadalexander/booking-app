import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { findSettings } from "@/lib/settings";
import WelcomeForm from "./WelcomeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

/** First sign-in on a new copy: the few details the app needs before anything else works. */
export default async function WelcomePage() {
  await requireAdmin();
  if (await findSettings()) redirect("/admin");
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold">Welcome to your booking app</h1>
      <p className="mt-2 text-sm text-stone-600">
        A few details to get started. You can change all of them later in Settings.
      </p>
      <WelcomeForm />
    </main>
  );
}
