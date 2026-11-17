-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#0f766e',
    "tagline" TEXT NOT NULL DEFAULT '',
    "defaultCancelWindowHours" INTEGER NOT NULL DEFAULT 24,
    "storageWarnedLevel" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Settings" ("brandColor", "businessName", "defaultCancelWindowHours", "id", "ownerEmail", "ownerName", "tagline", "timezone") SELECT "brandColor", "businessName", "defaultCancelWindowHours", "id", "ownerEmail", "ownerName", "tagline", "timezone" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
