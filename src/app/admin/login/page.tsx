import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-24">
      <h1 className="mb-6 text-center text-2xl font-semibold">Owner sign-in</h1>
      <LoginForm />
    </main>
  );
}
