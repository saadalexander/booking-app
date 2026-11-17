-- Booking-type categories (e.g. "Discovery calls"), shown as sections in the dashboard and on the booking page
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE "EventType" ADD COLUMN "categoryId" TEXT REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Brand colour update for an earlier install (does nothing on a new one)
UPDATE "Settings" SET "brandColor" = '#D99559' WHERE "brandColor" = '#0f766e';
