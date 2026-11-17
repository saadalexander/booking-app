-- MailerLite: API key (encrypted), per-booking-type group + field prefix, per-booking sync status
ALTER TABLE "Settings" ADD COLUMN "mailerliteKey" TEXT;
ALTER TABLE "EventType" ADD COLUMN "mailerliteGroupId" TEXT;
ALTER TABLE "EventType" ADD COLUMN "mailerliteFieldPrefix" TEXT;
ALTER TABLE "Booking" ADD COLUMN "mailerliteSyncError" TEXT;
