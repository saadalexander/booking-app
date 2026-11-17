"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ICONS: Record<string, React.ReactNode> = {
  bookings: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  types: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  hours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  clients: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  links: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  google: <><path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z" /></>,
  outbox: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  insights: <><path d="M3 3v18h18" /><path d="M7 16v-3M11 16V9M15 16v-5M19 16V6" /></>,
  automations: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></>,
  events: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M19 8v6M22 11h-6" /></>,
  external: <><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

const NAV = [
  { href: "/admin", label: "Bookings", icon: "bookings" },
  { href: "/admin/event-types", label: "Booking types", icon: "types" },
  { href: "/admin/events", label: "Events", icon: "events" },
  { href: "/admin/insights", label: "Insights", icon: "insights" },
  { href: "/admin/workflows", label: "Automations", icon: "automations" },
  { href: "/admin/schedules", label: "Availability", icon: "hours" },
  { href: "/admin/clients", label: "Contacts", icon: "clients" },
  { href: "/admin/links", label: "Private links", icon: "links" },
  { href: "/admin/integrations", label: "Google & email", icon: "google" },
  { href: "/admin/outbox", label: "Email outbox", icon: "outbox" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

const CREATE = [
  { href: "/admin/event-types/new", label: "Booking type", hint: "A new kind of call people can book" },
  { href: "/admin/events/new", label: "Group event", hint: "A workshop or webinar on a set date" },
  { href: "/admin/links", label: "Private link", hint: "A one-time link for one client" },
  { href: "/admin/schedules/new", label: "Availability schedule", hint: "A set of weekly hours" },
  { href: "/admin/event-types#categories", label: "Category", hint: "A group of booking types" },
  { href: "/admin/workflows/new", label: "Automation", hint: "An email that sends itself" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/bookings");
  return pathname === href || pathname.startsWith(href + "/");
}

const THEMES = {
  dark: {
    aside: "bg-[#151B1F] text-stone-200",
    name: "text-white",
    active: "bg-white/10 text-white",
    idle: "text-stone-300 hover:bg-white/5 hover:text-white",
    footer: "border-white/10",
    footerLink: "text-stone-400 hover:bg-white/5 hover:text-white",
    shadow: "shadow-black/30",
  },
  light: {
    aside: "bg-[#F4F4F2] text-stone-700 md:border-r md:border-stone-200 border-b border-stone-200 md:border-b-0",
    name: "text-stone-900",
    active: "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200",
    idle: "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900",
    footer: "border-stone-200",
    footerLink: "text-stone-500 hover:bg-stone-200/60 hover:text-stone-900",
    shadow: "shadow-stone-400/30",
  },
} as const;

export default function SideNav({
  businessName,
  logoutAction,
  variant = "dark",
  version,
}: {
  businessName: string;
  version?: string;
  logoutAction: () => Promise<void>;
  variant?: keyof typeof THEMES;
}) {
  const t = THEMES[variant];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => menu.current && !menu.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <aside className={`sticky top-0 z-20 flex shrink-0 flex-col md:h-screen md:w-72 ${t.aside}`}>
      <div className="flex items-center gap-3 px-5 pb-4 pt-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/avatar.png" alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-[var(--brand)]" />
        <div className="min-w-0">
          <p className={`font-display truncate text-base ${t.name}`}>{businessName}</p>
        </div>
      </div>

      <div ref={menu} className="relative px-4 pb-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`btn-brand flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-base font-semibold shadow-lg ${t.shadow}`}
        >
          <span className="text-xl leading-none">+</span> Create
        </button>
        {open && (
          <div className="absolute left-4 right-4 top-full z-30 mt-1 overflow-hidden rounded-xl bg-white text-stone-900 shadow-xl ring-1 ring-black/10">
            {CREATE.map((c) => (
              <Link key={c.label} href={c.href} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-stone-100">
                <span className="block font-medium">{c.label}</span>
                <span className="block text-xs text-stone-500">{c.hint}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-4 py-3 text-[15px] font-medium transition ${
                active ? `${t.active} md:border-l-4 md:border-[var(--brand)] md:pl-3` : t.idle
              }`}
            >
              <Icon name={n.icon} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className={`hidden border-t p-3 md:block ${t.footer}`}>
        <Link href="/" target="_blank" className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm ${t.footerLink}`}>
          <Icon name="external" className="h-4 w-4" /> View booking page
        </Link>
        <form action={logoutAction}>
          <button className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm ${t.footerLink}`}>
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </form>
        {version && (
          <p className={`px-4 pt-1 text-xs opacity-60 ${t.footerLink}`}>
            Version {version}
          </p>
        )}
      </div>
    </aside>
  );
}
