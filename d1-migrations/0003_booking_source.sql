-- Imported bookings: where they came from and their id there (idempotent imports)
ALTER TABLE "Booking" ADD COLUMN "source" TEXT;
ALTER TABLE "Booking" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "Booking_source_externalId_key" ON "Booking"("source", "externalId");
