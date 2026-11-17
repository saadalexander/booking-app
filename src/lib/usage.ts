import { prisma } from "./db";
import { sendOwnerAlert } from "./email";
import { formatBytes, warnLevel } from "./usage-levels";

export { formatBytes } from "./usage-levels";

/**
 * Storage usage of client uploads against Cloudflare R2's free allowance (10 GB-month).
 * The app is the only writer to the bucket and records every file's size, so the sum of
 * Upload.size is the bucket's size. Override the allowance with STORAGE_FREE_BYTES if needed.
 */
export const STORAGE_FREE_BYTES = Number(process.env.STORAGE_FREE_BYTES ?? 10 * 1000 ** 3);
export async function getStorageUsage() {
  const agg = await prisma.upload.aggregate({ _sum: { size: true }, _count: { _all: true } });
  const used = agg._sum.size ?? 0;
  const percent = (used / STORAGE_FREE_BYTES) * 100;
  return { used, limit: STORAGE_FREE_BYTES, percent, files: agg._count._all, level: warnLevel(percent) };
}

/** Emails the owner once when usage first crosses 70% and again at 90%. Safe to run repeatedly. */
export async function checkStorageAndWarn() {
  const usage = await getStorageUsage();
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) return usage;
  if (usage.level > settings.storageWarnedLevel) {
    await sendOwnerAlert(
      `Storage warning: client uploads at ${Math.floor(usage.percent)}% of the free allowance`,
      [
        `Client uploads now use ${formatBytes(usage.used)} of the ${formatBytes(usage.limit)} free R2 storage (${usage.files} files).`,
        ``,
        usage.level >= 90
          ? `You're close to the limit. Beyond it Cloudflare charges about US$0.015 per GB per month — small, but you asked to be warned.`
          : `Nothing to do yet. You'll get one more warning at 90%.`,
        ``,
        `Options: download and remove old files, or accept the small storage charge.`,
      ].join("\n"),
      "owner_storage_warning",
    );
    await prisma.settings.update({ where: { id: 1 }, data: { storageWarnedLevel: usage.level } });
  } else if (usage.level < settings.storageWarnedLevel) {
    // Usage went back down (files removed): re-arm the warnings.
    await prisma.settings.update({ where: { id: 1 }, data: { storageWarnedLevel: usage.level } });
  }
  return usage;
}
