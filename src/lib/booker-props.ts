import type { FullEventType } from "./availability";
import { renderMarkdown } from "./markdown";
import { LOCATION_LABELS, parseJson, type Consent } from "./settings";

export interface BookerEventType {
  slug: string;
  title: string;
  descriptionHtml: string;
  durationMinutes: number;
  locationLabel: string;
  lockTimezone: boolean;
  scheduleTimezone: string;
  allowGuests: boolean;
  collectPhone: "hidden" | "optional" | "required";
  showNotes: boolean;
  seats: number | null;
  questions: { key: string; label: string; type: string; required: boolean; options: string[] }[];
  checklist: string[];
  consents: Consent[];
}

export function toBookerEventType(et: FullEventType): BookerEventType {
  return {
    slug: et.slug,
    title: et.title,
    descriptionHtml: renderMarkdown(et.description),
    durationMinutes: et.durationMinutes,
    locationLabel: LOCATION_LABELS[et.locationType] ?? et.locationType,
    lockTimezone: et.lockTimezone,
    scheduleTimezone: et.schedule.timezone,
    allowGuests: et.allowGuests,
    collectPhone: (["hidden", "optional", "required"].includes(et.collectPhone) ? et.collectPhone : "hidden") as BookerEventType["collectPhone"],
    showNotes: et.showNotes,
    seats: et.seats,
    questions: et.questions.map((q) => ({ key: q.key, label: q.label, type: q.type, required: q.required, options: parseJson<string[]>(q.options, []) })),
    checklist: parseJson<string[]>(et.checklist, []),
    consents: parseJson<Consent[]>(et.consents, []),
  };
}
