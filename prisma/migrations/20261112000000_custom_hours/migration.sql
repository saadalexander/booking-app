-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN "customForEventTypeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_customForEventTypeId_key" ON "Schedule"("customForEventTypeId");

