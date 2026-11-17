import { getSettings } from "@/lib/settings";
import { formatBytes, getStorageUsage } from "@/lib/usage";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const [s, storage] = await Promise.all([getSettings(), getStorageUsage()]);
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-stone-600">
        Client file storage: {formatBytes(storage.used)} of {formatBytes(storage.limit)} free ({storage.percent.toFixed(1)}%, {storage.files} files). You&apos;ll be emailed at 70% and 90%.
      </p>
      <SettingsForm
        values={{
          businessName: s.businessName,
          ownerName: s.ownerName,
          ownerEmail: s.ownerEmail,
          timezone: s.timezone,
          brandColor: s.brandColor,
          tagline: s.tagline,
          defaultCancelWindowHours: s.defaultCancelWindowHours,
          sidebarStyle: s.sidebarStyle,
        }}
      />
    </div>
  );
}
