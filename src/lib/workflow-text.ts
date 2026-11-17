/** Automation wording, triggers and templates — plain code that also runs in the browser (editor preview). */

export const TRIGGERS = {
  booking_created: "When someone books",
  booking_rescheduled: "When someone reschedules",
  booking_cancelled: "When a booking is cancelled",
  before_start: "Before the call starts",
  after_end: "After the call ends",
} as const;
export type Trigger = keyof typeof TRIGGERS;
export const TIMED: Trigger[] = ["before_start", "after_end"];
export const INSTANT: Trigger[] = ["booking_created", "booking_rescheduled", "booking_cancelled"];

export const VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: "first_name", label: "Client's first name", sample: "Alex" },
  { key: "name", label: "Client's full name", sample: "Alex Smith" },
  { key: "email", label: "Client's email", sample: "alex@example.com" },
  { key: "phone", label: "Client's phone", sample: "+61 400 000 000" },
  { key: "event_name", label: "Booking type name", sample: "Coaching Inquiry Call" },
  { key: "appointment", label: "Neutral title (no health details)", sample: "Appointment with Alex" },
  { key: "date", label: "Date", sample: "Thursday 19 November 2026" },
  { key: "time", label: "Start time (client's timezone)", sample: "10:00 AM" },
  { key: "timezone", label: "Client's timezone", sample: "Australia/Melbourne" },
  { key: "duration", label: "Length", sample: "30 minutes" },
  { key: "location", label: "Where (with Meet link)", sample: "Google Meet video call: https://meet.google.com/abc-defg-hij" },
  { key: "meet_link", label: "Google Meet link", sample: "https://meet.google.com/abc-defg-hij" },
  { key: "manage_link", label: "Reschedule / cancel link", sample: "https://book.example.com/booking/…" },
  { key: "rebook_link", label: "Book this type again", sample: "https://book.example.com/general" },
  { key: "booking_page", label: "Your booking page", sample: "https://book.example.com/" },
  { key: "owner_name", label: "Your name", sample: "Alex" },
  { key: "business_name", label: "Business name", sample: "Your Business" },
];

/** Replaces {placeholders}; unknown ones are left as typed so mistakes are visible in a test send. */
export function render(text: string, vars: Record<string, string>) {
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export function sampleVariables(owner?: { ownerName: string; businessName: string; baseUrl?: string }) {
  const v = Object.fromEntries(VARIABLES.map((x) => [x.key, x.sample]));
  if (owner) {
    v.owner_name = owner.ownerName;
    v.business_name = owner.businessName;
    v.appointment = `Appointment with ${owner.ownerName}`;
  }
  if (owner?.baseUrl) {
    for (const k of ["manage_link", "rebook_link", "booking_page"]) v[k] = v[k].replace("https://book.example.com", owner.baseUrl);
  }
  return v;
}

/** "24 hours before the call starts · to the client" */
export function describe(w: { trigger: string; offsetMinutes: number; recipient: string }) {
  const amount = (m: number) => {
    if (m === 0) return "Right";
    if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"}`;
    if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
    return `${m} minutes`;
  };
  const when =
    w.trigger === "before_start"
      ? `${amount(w.offsetMinutes)} before the call starts`
      : w.trigger === "after_end"
        ? `${amount(w.offsetMinutes)} after the call ends`
        : TRIGGERS[w.trigger as Trigger] ?? w.trigger;
  return `${when} · to ${w.recipient === "owner" ? "you" : "the client"}`;
}

/** Ready-made automations to start from (shown on the Automations page). */
export const TEMPLATES: { key: string; name: string; blurb: string; trigger: Trigger; offsetMinutes: number; recipient: "client" | "owner"; subject: string; body: string }[] = [
  {
    key: "reminder-24h",
    name: "Reminder 24 hours before",
    blurb: "Cuts no-shows. Includes the joining link and a reschedule link.",
    trigger: "before_start",
    offsetMinutes: 1440,
    recipient: "client",
    subject: "Tomorrow: {appointment} at {time}",
    body: "Hi {first_name},\n\nJust a reminder that we're booked in for {date} at {time} ({timezone}).\n\nWhere: {location}\n\nNeed to move it? {manage_link}\n\nSee you then,\n{owner_name}",
  },
  {
    key: "reminder-1h",
    name: "Reminder 1 hour before",
    blurb: "A short nudge with the joining link.",
    trigger: "before_start",
    offsetMinutes: 60,
    recipient: "client",
    subject: "Starting in 1 hour: {appointment}",
    body: "Hi {first_name},\n\nWe're on in an hour, at {time}.\n\n{location}\n\nSee you soon,\n{owner_name}",
  },
  {
    key: "thank-you",
    name: "Thank you after the call",
    blurb: "Sent an hour after the call ends.",
    trigger: "after_end",
    offsetMinutes: 60,
    recipient: "client",
    subject: "Thanks for today, {first_name}",
    body: "Hi {first_name},\n\nThanks for your time today. It was great to chat.\n\nIf you'd like to book your next session, you can do that here: {rebook_link}\n\nSpeak soon,\n{owner_name}",
  },
  {
    key: "follow-up-3d",
    name: "Follow-up 3 days later",
    blurb: "Checks in and invites them to book again.",
    trigger: "after_end",
    offsetMinutes: 4320,
    recipient: "client",
    subject: "Checking in, {first_name}",
    body: "Hi {first_name},\n\nJust checking in after our call a few days ago. How are you going with everything we discussed?\n\nWhenever you're ready for the next step, you can book here: {booking_page}\n\n{owner_name}",
  },
  {
    key: "rebook-after-cancel",
    name: "Invite to rebook after a cancellation",
    blurb: "Gently brings people back when they cancel.",
    trigger: "booking_cancelled",
    offsetMinutes: 0,
    recipient: "client",
    subject: "Let's find another time, {first_name}",
    body: "Hi {first_name},\n\nNo worries about cancelling. Whenever suits, you can pick a new time here: {rebook_link}\n\n{owner_name}",
  },
  {
    key: "owner-heads-up",
    name: "Heads-up to me 1 hour before",
    blurb: "A note to you with the client's details before each call.",
    trigger: "before_start",
    offsetMinutes: 60,
    recipient: "owner",
    subject: "In 1 hour: {name} — {event_name}",
    body: "{name} ({email}, {phone})\n{event_name} at {time} ({timezone})\n\n{location}",
  },
];
