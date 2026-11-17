"use client";

import { useActionState, useEffect, useState } from "react";
import HoursEditor, { type Hours } from "@/components/HoursEditor";
import { saveEventType } from "../../../actions";

type Q = { key: string; label: string; type: string; required: boolean; options: string[] };
type C = { key: string; label: string; required: boolean };

export interface EventTypeFormValues {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  hidden: boolean;
  locationType: string;
  locationDetail: string;
  scheduleId: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  periodType: string;
  periodDays: number | null;
  periodStart: string;
  periodEnd: string;
  slotIntervalMinutes: number | null;
  seats: number | null;
  dailyCap: number | null;
  firstSlotOnly: boolean;
  optimizedSlots: boolean;
  lockTimezone: boolean;
  allowGuests: boolean;
  collectPhone: string;
  showNotes: boolean;
  neutralTitle: string;
  cancelWindowHours: number | null;
  checklist: string;
  questions: Q[];
  consents: C[];
  source: string | null;
  categoryId: string;
  mailerliteGroupId: string;
  mailerliteFieldPrefix: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const NAV = [
  { group: "Setup", items: [["basics", "Basics"], ["availability", "Availability"]] },
  { group: "Booking experience", items: [["form", "Booking form"], ["emails", "Emails & invites"]] },
  { group: "Policies", items: [["limits", "Limits & buffers"], ["window", "How far ahead"], ["reschedule", "Reschedule & cancel"]] },
  { group: "Integrations", items: [["mailerlite", "MailerLite"]] },
] as const;
type SectionKey = (typeof NAV)[number]["items"][number][0];

export default function EventTypeForm({
  values: v,
  schedules,
  categories,
  mailerliteGroups,
  hasCustomHours,
  customHours,
}: {
  values: EventTypeFormValues;
  schedules: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  mailerliteGroups: { id: string; name: string }[] | null;
  hasCustomHours: boolean;
  customHours: Hours;
}) {
  const [state, action, pending] = useActionState(saveEventType, undefined);
  const [tab, setTab] = useState<SectionKey>("basics");
  const [hoursMode, setHoursMode] = useState<"shared" | "custom">(hasCustomHours ? "custom" : "shared");
  const [hours, setHours] = useState<Hours>(customHours);
  const [questions, setQuestions] = useState<Q[]>(v.questions);
  const [consents, setConsents] = useState<C[]>(v.consents);
  const [periodType, setPeriodType] = useState(v.periodType === "unlimited" ? "rolling" : v.periodType);
  const [limitFuture, setLimitFuture] = useState(v.periodType !== "unlimited");

  // Remember the open section in the address (#limits), so a reload or shared link opens it.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (NAV.some((g) => g.items.some(([k]) => k === h))) setTab(h as SectionKey);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const updateQ = (i: number, patch: Partial<Q>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => {
    const next = [...questions];
    const [q] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, q);
    setQuestions(next);
  };
  const show = (k: SectionKey) => (tab === k ? "" : "hidden");

  return (
    // noValidate: sections that aren't open are hidden, so the browser can't point at a field there.
    // The server checks everything and the message below says which field needs fixing.
    <form action={action} noValidate className="mt-6 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />
      <input type="hidden" name="consents" value={JSON.stringify(consents)} />
      <input type="hidden" name="hoursMode" value={hoursMode} />
      <input type="hidden" name="customHours" value={JSON.stringify(hours)} />
      <input type="hidden" name="periodType" value={limitFuture ? periodType : "unlimited"} />

      <nav className="md:sticky md:top-6 md:self-start" aria-label="Settings sections">
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-stone-500">{g.group}</p>
            {g.items.map(([k, label]) => (
              <a
                key={k}
                href={`#${k}`}
                onClick={() => setTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`block rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-white font-medium text-stone-900 ring-1 ring-stone-200" : "text-stone-600 hover:bg-white/70 hover:text-stone-900"}`}
              >
                {label}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">
        <Section title="Basics" className={show("basics")}>
          <L label="Title"><input name="title" className="input" defaultValue={v.title} required /></L>
          <L label="Link" hint="Your booking page address: /link">
            <input name="slug" className="input font-mono" defaultValue={v.slug} required pattern="[a-z0-9][a-z0-9\-]*" onBlur={(e) => (e.target.value = slugify(e.target.value))} />
          </L>
          <L label="Category" hint="Groups booking types on your dashboard and booking page">
            <select name="categoryId" className="input" defaultValue={v.categoryId}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </L>
          <L label="Description" hint="Supports **bold**, _italic_, [links](https://…) and * bullet lists">
            <textarea name="description" className="input min-h-48 text-sm" defaultValue={v.description} />
          </L>
          <div className="grid gap-4 sm:grid-cols-2">
            <L label="Length (minutes)"><input name="durationMinutes" type="number" min={5} max={600} className="input" defaultValue={v.durationMinutes} required /></L>
            <L label="Location">
              <select name="locationType" className="input" defaultValue={v.locationType}>
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="phone">Phone (you call them)</option>
                <option value="in_person">In person</option>
              </select>
            </L>
          </div>
          <L label="Location details (optional)" hint="e.g. an address for in-person sessions"><input name="locationDetail" className="input" defaultValue={v.locationDetail} /></L>
          <Rows>
            <ToggleRow name="hidden" title="Hidden" desc="Not listed on your booking page. Anyone with the link can still book it." defaultChecked={v.hidden} />
          </Rows>
        </Section>

        <Section title="Availability" className={show("availability")}>
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2">
              <input type="radio" name="hoursModeRadio" checked={hoursMode === "shared"} onChange={() => setHoursMode("shared")} className="accent-[var(--brand)]" />
              Use a shared schedule
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="hoursModeRadio" checked={hoursMode === "custom"} onChange={() => setHoursMode("custom")} className="accent-[var(--brand)]" />
              Custom hours for this booking type
            </label>
          </div>
          <select name="scheduleId" className={`input max-w-sm ${hoursMode === "custom" ? "hidden" : ""}`} defaultValue={v.scheduleId}>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {hoursMode === "custom" && (
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="mb-4 text-xs text-stone-500">These hours replace the shared schedule for this booking type only. Your connected calendars still block busy times.</p>
              <HoursEditor value={hours} onChange={setHours} />
            </div>
          )}
          <Rows>
            <ToggleRow name="lockTimezone" title="Lock times to your timezone" desc="Everyone sees times in your timezone instead of their own. Good for in-person sessions." defaultChecked={v.lockTimezone} />
          </Rows>
        </Section>

        <Section title="Limits & buffers" className={show("limits")}>
          <Rows>
            <Row title="Minimum notice" desc="How soon someone can book. With 1 day, nobody can grab a time less than 24 hours away.">
              <DurationInput name="minNoticeMinutes" minutes={v.minNoticeMinutes} />
            </Row>
            <Row title="Buffer before" desc="Time kept free before this call, e.g. to prepare. Nothing else can be booked into it.">
              <MinutesInput name="bufferBeforeMinutes" value={v.bufferBeforeMinutes} />
            </Row>
            <Row title="Buffer after" desc="Time kept free after this call, for notes or a break.">
              <MinutesInput name="bufferAfterMinutes" value={v.bufferAfterMinutes} />
            </Row>
            <OptionalNumberRow
              name="slotIntervalMinutes"
              title="Custom start times"
              desc="How often start times are offered. Off = every call length (a 60-min call shows 9:00, 10:00…). 15 shows 9:00, 9:15, 9:30…"
              value={v.slotIntervalMinutes}
              suffix="min"
              min={5}
              placeholder={15}
            />
            <ToggleRow
              name="optimizedSlots"
              title="Optimized slots"
              desc="Offer a time right when an earlier booking finishes (a call ending 9:20 opens 9:20), instead of only fixed times like 9:00 and 9:30."
              defaultChecked={v.optimizedSlots}
            />
            <ToggleRow name="firstSlotOnly" title="Only the first free time each day" desc="Shows just the earliest available time per day, so your bookings stack together." defaultChecked={v.firstSlotOnly} />
            <OptionalNumberRow name="dailyCap" title="Limit bookings per day" desc="Stops offering this call once this many are booked on the same day." value={v.dailyCap} suffix="per day" min={1} placeholder={3} />
            <OptionalNumberRow name="seats" title="Group seats" desc="Let several people book the same time, up to this many. Off = one person per time (1:1)." value={v.seats} suffix="seats" min={2} placeholder={5} />
          </Rows>
        </Section>

        <Section title="How far ahead" className={show("window")}>
          <Rows>
            <Row
              title="Limit how far ahead people can book"
              desc="Off = any date in the future. On = only within the window you set below."
            >
              <Toggle checked={limitFuture} onChange={setLimitFuture} label="Limit how far ahead" />
            </Row>
            {limitFuture && (
              <div className="space-y-3 px-4 py-4">
                <Radio name="periodTypeChoice" checked={periodType === "rolling"} onChange={() => setPeriodType("rolling")}>
                  <span className="font-medium">The next</span> <NumberBox name={periodType === "rolling" ? "periodDays" : undefined} defaultValue={v.periodDays ?? 30} /> calendar days
                  <Desc>Counts every day, including days you don&apos;t work. 30 = the next 30 days from today.</Desc>
                </Radio>
                <Radio name="periodTypeChoice" checked={periodType === "rolling_window"} onChange={() => setPeriodType("rolling_window")}>
                  <span className="font-medium">The next</span> <NumberBox name={periodType === "rolling_window" ? "periodDays" : undefined} defaultValue={v.periodDays ?? 10} /> days that have times
                  <Desc>Counts only days you&apos;re available, so people always see this many bookable days.</Desc>
                </Radio>
                <Radio name="periodTypeChoice" checked={periodType === "range"} onChange={() => setPeriodType("range")}>
                  <span className="font-medium">Between two dates</span>
                  <Desc>Only dates in this range, e.g. for a launch or a limited intake.</Desc>
                  {periodType === "range" && (
                    <span className="mt-2 flex flex-wrap gap-2">
                      <input name="periodStart" type="date" className="input !w-auto" defaultValue={v.periodStart} aria-label="From" />
                      <span className="self-center text-stone-500">to</span>
                      <input name="periodEnd" type="date" className="input !w-auto" defaultValue={v.periodEnd} aria-label="To" />
                    </span>
                  )}
                </Radio>
              </div>
            )}
          </Rows>
        </Section>

        <Section title="Reschedule & cancel" className={show("reschedule")}>
          <Rows>
            <Row title="Self-serve cut-off" desc="Clients can reschedule or cancel online until this many hours before the call. Empty = your default from Settings. Never stricter than the minimum notice.">
              <span className="flex items-center gap-2">
                <input name="cancelWindowHours" type="number" min={0} className="input !w-24" defaultValue={v.cancelWindowHours ?? ""} placeholder="Default" />
                <span className="text-sm text-stone-500">hours</span>
              </span>
            </Row>
          </Rows>
        </Section>

        <Section title="Booking form" className={show("form")}>
          <Rows>
            <Row title="Phone number" desc="Ask for their phone number on the booking form.">
              <select name="collectPhone" className="input !w-36" defaultValue={v.collectPhone}>
                <option value="hidden">Don&apos;t ask</option>
                <option value="optional">Optional</option>
                <option value="required">Required</option>
              </select>
            </Row>
            <ToggleRow name="showNotes" title="“Anything else I should know?” box" desc="An optional notes box at the end of the form." defaultChecked={v.showNotes} />
            <ToggleRow name="allowGuests" title="Let clients add guests" desc="They can add other people's emails to the invite." defaultChecked={v.allowGuests} />
          </Rows>

          <div className="space-y-3">
            <p className="text-sm font-medium">Questions</p>
            {questions.map((q, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-stone-200 p-3">
                <div className="flex gap-2">
                  <input className="input" placeholder="Question" value={q.label} onChange={(e) => updateQ(i, { label: e.target.value, key: q.key || slugify(e.target.value).slice(0, 40) })} />
                  <select className="input !w-40" value={q.type} onChange={(e) => updateQ(i, { type: e.target.value })}>
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                    <option value="select">Dropdown</option>
                    <option value="multiselect">Checkboxes</option>
                    <option value="phone">Phone</option>
                    <option value="file">File upload</option>
                  </select>
                </div>
                {(q.type === "select" || q.type === "multiselect") && (
                  <input className="input text-sm" placeholder="Options, separated by commas" value={q.options.join(", ")} onChange={(e) => updateQ(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
                )}
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={q.required} onChange={(e) => updateQ(i, { required: e.target.checked })} /> Required</label>
                  <button type="button" className="text-stone-500" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="text-stone-500" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="ml-auto text-red-700" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            ))}
            <button type="button" className="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm" onClick={() => setQuestions([...questions, { key: `q${Date.now().toString(36)}`, label: "", type: "text", required: false, options: [] }])}>
              + Add question
            </button>
          </div>

          <L label="Checklist before booking" hint="One item per line. Clients must tick each one.">
            <textarea name="checklist" className="input min-h-20 text-sm" defaultValue={v.checklist} />
          </L>

          <div className="space-y-2">
            <p className="text-sm font-medium">Consent checkboxes</p>
            {consents.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input text-sm" value={c.label} onChange={(e) => setConsents(consents.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <label className="flex shrink-0 items-center gap-1 text-sm"><input type="checkbox" checked={c.required} onChange={(e) => setConsents(consents.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> Required</label>
                <button type="button" className="text-sm text-red-700" onClick={() => setConsents(consents.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </div>
            ))}
            <button type="button" className="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm" onClick={() => setConsents([...consents, { key: `c${Date.now().toString(36)}`, label: "", required: true }])}>
              + Add consent
            </button>
          </div>
        </Section>

        <Section title="Emails & invites" className={show("emails")}>
          <L label="Title used in emails and calendar invites" hint="Leave empty for a neutral “Appointment with …” (keeps health details out of inboxes).">
            <input name="neutralTitle" className="input" defaultValue={v.neutralTitle} />
          </L>
        </Section>

        <Section title="MailerLite" className={show("mailerlite")}>
          {mailerliteGroups === null ? (
            <p className="text-sm text-stone-600">Connect MailerLite on the “Google &amp; email” page to add people who book this to a MailerLite group.</p>
          ) : (
            <>
              <L label="Add people who book this to" hint="Joining the group starts any MailerLite automation it triggers (e.g. your ZION nurture). Cancelling removes them.">
                <select name="mailerliteGroupId" className="input" defaultValue={v.mailerliteGroupId}>
                  <option value="">Don&apos;t send to MailerLite</option>
                  {v.mailerliteGroupId && !mailerliteGroups.some((g) => g.id === v.mailerliteGroupId) && <option value={v.mailerliteGroupId}>Group {v.mailerliteGroupId}</option>}
                  {mailerliteGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </L>
              <L label="Call-detail fields (optional)" hint="e.g. zion_call fills zion_call_date, zion_call_when and zion_call_link in MailerLite.">
                <input name="mailerliteFieldPrefix" className="input font-mono" defaultValue={v.mailerliteFieldPrefix} placeholder="zion_call" />
              </L>
            </>
          )}
        </Section>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-stone-50/95 py-4 backdrop-blur">
          <button disabled={pending} className="btn-brand rounded-lg px-5 py-2.5 font-medium">{pending ? "Saving…" : "Save"}</button>
          <span className="text-xs text-stone-500">Saves every section.</span>
          {state?.ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
          {state?.error && <span className="whitespace-pre-line text-sm text-red-700" role="alert">{friendlyError(state.error)}</span>}
        </div>
      </div>
    </form>
  );
}

/** Turn "durationMinutes: Too small…" into "Length (Basics): Too small…". */
const FIELD_NAMES: Record<string, string> = {
  title: "Title (Basics)",
  slug: "Link (Basics)",
  durationMinutes: "Length (Basics)",
  periodDays: "How far ahead",
  slotIntervalMinutes: "Custom start times (Limits)",
  dailyCap: "Bookings per day (Limits)",
  seats: "Group seats (Limits)",
};
function friendlyError(msg: string) {
  return msg
    .split("\n")
    .map((line) => {
      const [field, ...rest] = line.split(": ");
      return FIELD_NAMES[field] ? `${FIELD_NAMES[field]}: ${rest.join(": ")}` : line;
    })
    .join("\n");
}

function Section({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`space-y-4 rounded-xl bg-white p-5 ring-1 ring-stone-200 ${className}`}>
      <h2 className="border-b border-stone-100 pb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** An outlined list of settings, one per row (like Cal.com / Calendly). */
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-stone-200 rounded-xl border border-stone-200">{children}</div>;
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-stone-500">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Desc({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-sm text-stone-500">{children}</span>;
}

function Toggle({ name, checked, onChange, defaultChecked, label }: { name?: string; checked?: boolean; onChange?: (v: boolean) => void; defaultChecked?: boolean; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        name={name}
        className="peer sr-only"
        aria-label={label}
        {...(onChange ? { checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) } : { defaultChecked })}
      />
      <span className="relative h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-[#151B1F] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand)] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

function ToggleRow({ name, title, desc, defaultChecked }: { name: string; title: string; desc: string; defaultChecked: boolean }) {
  return (
    <Row title={title} desc={desc}>
      <Toggle name={name} defaultChecked={defaultChecked} label={title} />
    </Row>
  );
}

/** A limit that is off (no limit) or on with a number. Off sends an empty value = no limit. */
function OptionalNumberRow({ name, title, desc, value, suffix, min, placeholder }: { name: string; title: string; desc: string; value: number | null; suffix: string; min: number; placeholder: number }) {
  const [on, setOn] = useState(value != null);
  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-stone-500">{desc}</p>
        </div>
        <Toggle checked={on} onChange={setOn} label={title} />
      </div>
      {on ? (
        <span className="mt-3 flex items-center gap-2">
          <input name={name} type="number" min={min} className="input !w-24" defaultValue={value ?? placeholder} />
          <span className="text-sm text-stone-500">{suffix}</span>
        </span>
      ) : (
        <input type="hidden" name={name} value="" />
      )}
    </div>
  );
}

function MinutesInput({ name, value }: { name: string; value: number }) {
  return (
    <span className="flex items-center gap-2">
      <input name={name} type="number" min={0} className="input !w-24" defaultValue={value} />
      <span className="text-sm text-stone-500">min</span>
    </span>
  );
}

/** Number + minutes/hours/days; submits the total in minutes. */
function DurationInput({ name, minutes }: { name: string; minutes: number }) {
  const initialUnit = minutes > 0 && minutes % 1440 === 0 ? 1440 : minutes > 0 && minutes % 60 === 0 ? 60 : 1;
  const [unit, setUnit] = useState(initialUnit);
  const [amount, setAmount] = useState(String(minutes / initialUnit));
  const total = Math.round((Number(amount) || 0) * unit);
  return (
    <span className="flex items-center gap-2">
      <input type="hidden" name={name} value={total} />
      <input type="number" min={0} step="any" className="input !w-24" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
      <select className="input !w-28" value={unit} onChange={(e) => setUnit(Number(e.target.value))} aria-label="Unit">
        <option value={1}>minutes</option>
        <option value={60}>hours</option>
        <option value={1440}>days</option>
      </select>
    </span>
  );
}

function NumberBox({ name, defaultValue }: { name?: string; defaultValue: number }) {
  return <input name={name} type="number" min={1} className="input mx-1 inline-block !w-20 !py-1" defaultValue={defaultValue} onClick={(e) => e.stopPropagation()} />;
}

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${checked ? "border-stone-800" : "border-stone-200"}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[var(--brand)]" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
