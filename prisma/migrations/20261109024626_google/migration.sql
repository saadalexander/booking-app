-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "googleEventId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "googleSyncError" TEXT;
ALTER TABLE "Booking" ADD COLUMN "meetUrl" TEXT;

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "destinationCalendarId" TEXT NOT NULL DEFAULT 'primary',
    "conflictCalendarIds" TEXT NOT NULL DEFAULT '["primary"]',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'logged',
    "sentTo" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_EmailLog" ("body", "bookingId", "createdAt", "id", "kind", "subject", "to") SELECT "body", "bookingId", "createdAt", "id", "kind", "subject", "to" FROM "EmailLog";
DROP TABLE "EmailLog";
ALTER TABLE "new_EmailLog" RENAME TO "EmailLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
