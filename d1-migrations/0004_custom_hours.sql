-- Custom hours per booking type: a schedule owned by one booking type
ALTER TABLE "Schedule" ADD COLUMN "customForEventTypeId" TEXT;
CREATE UNIQUE INDEX "Schedule_customForEventTypeId_key" ON "Schedule"("customForEventTypeId");
