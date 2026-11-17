"use client";

import { useActionState } from "react";
import { saveGoogleClientKeys } from "../../setup-actions";
import CopyButton from "../events/[id]/CopyButton";

/** Step-by-step Google Cloud setup with the two keys pasted here (no Terminal, no config files). */
export default function GoogleClientForm({ redirectUri, origin }: { redirectUri: string; origin: string }) {
  const [state, action, pending] = useActionState(saveGoogleClientKeys, undefined);
  return (
    <div className="mt-3 space-y-4 text-sm text-stone-700">
      <p className="text-stone-600">
        Google needs a free “app” in your own Google Cloud account before it lets this site use your calendar and Gmail. It takes about 15 minutes, once.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Open <a className="underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud → New project</a>, signed in as the
          Google account with your calendar. Name it “Booking” and click <strong>Create</strong>.
        </li>
        <li>
          Turn on the <a className="underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Calendar API</a> and
          the <a className="underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API</a> (click <strong>Enable</strong> on each).
        </li>
        <li>
          Open <a className="underline" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Google Auth Platform → Branding</a> and click <strong>Get started</strong>.
          Give it your business name and email. For <strong>Audience</strong>: choose <strong>Internal</strong> if you use Google Workspace (an email at your own domain).
          With a free @gmail.com address choose <strong>External</strong>, then on the Audience page click <strong>Publish app</strong> (otherwise Google signs you out every 7 days).
        </li>
        <li>
          Open <a className="underline" href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">Clients → Create client</a>, choose <strong>Web application</strong>, and add:
          <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
            <div>
              <span className="block text-xs text-stone-500">Authorised JavaScript origins</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all">{origin}</code>
                <CopyButton text={origin} label="Copy" />
              </div>
            </div>
            <div>
              <span className="block text-xs text-stone-500">Authorised redirect URIs</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all">{redirectUri}</code>
                <CopyButton text={redirectUri} label="Copy" />
              </div>
            </div>
          </div>
        </li>
        <li>Click <strong>Create</strong>. Google shows a Client ID and a Client secret. Paste both here:</li>
      </ol>
      <form action={action} className="space-y-3">
        <label className="block">
          <span className="mb-1 block font-medium">Client ID</span>
          <input name="clientId" className="input font-mono text-xs" placeholder="…apps.googleusercontent.com" autoComplete="off" required />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Client secret</span>
          <input name="clientSecret" type="password" className="input font-mono text-xs" placeholder="GOCSPX-…" autoComplete="off" required />
        </label>
        <div className="flex items-center gap-3">
          <button disabled={pending} className="btn-brand rounded-lg px-4 py-2 font-medium">{pending ? "Saving…" : "Save Google keys"}</button>
          {state?.error && <span className="text-red-700">{state.error}</span>}
        </div>
        <p className="text-xs text-stone-500">The secret is kept in your own database and is only used to talk to Google.</p>
      </form>
    </div>
  );
}
