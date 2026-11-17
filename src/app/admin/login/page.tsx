import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const passwordSet = Boolean(process.env.ADMIN_PASSWORD);
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-24">
      <h1 className="mb-6 text-center text-2xl font-semibold">Owner sign-in</h1>
      {passwordSet ? (
        <LoginForm />
      ) : (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <p className="font-medium">No dashboard password has been set for this site yet.</p>
          <p>
            In the Cloudflare dashboard, open <strong>Workers &amp; Pages</strong> → your booking app → <strong>Settings</strong> →{" "}
            <strong>Variables and Secrets</strong> → <strong>Add</strong>. Choose type <strong>Secret</strong>, name it <code>ADMIN_PASSWORD</code>,
            enter the password you want, and click <strong>Deploy</strong>. Then refresh this page.
          </p>
        </div>
      )}
    </main>
  );
}
