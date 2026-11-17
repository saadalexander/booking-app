-- Optimized slots: also offer start times that fit right after existing bookings
ALTER TABLE "EventType" ADD COLUMN "optimizedSlots" BOOLEAN NOT NULL DEFAULT false;
