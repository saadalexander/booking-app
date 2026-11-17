-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_source_externalId_key" ON "Booking"("source", "externalId");

