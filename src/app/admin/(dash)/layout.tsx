import pkg from "../../../../package.json";
import { requireAdmin } from "@/lib/admin";
import { brandStyle, getSettings } from "@/lib/settings";
import { formatBytes, getStorageUsage } from "@/lib/usage";
import { logout } from "../actions";
import SideNav from "./SideNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const [settings, storage] = await Promise.all([getSettings(), getStorageUsage()]);
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 md:flex-row" style={brandStyle(settings.brandColor)}>
      <SideNav businessName={settings.businessName} version={pkg.version} logoutAction={logout} variant={settings.sidebarStyle === "light" ? "light" : "dark"} />
      <main className="min-w-0 flex-1 p-6 md:p-10">
        {storage.level > 0 && (
          <p className={`mb-6 rounded-lg p-3 text-sm ring-1 ${storage.level >= 90 ? "bg-red-50 text-red-800 ring-red-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`} role="alert">
            Storage warning: client uploads use {formatBytes(storage.used)} of the {formatBytes(storage.limit)} free allowance ({Math.floor(storage.percent)}%).
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
