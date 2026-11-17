-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#0f766e',
    "tagline" TEXT NOT NULL DEFAULT '',
    "defaultCancelWindowHours" INTEGER NOT NULL DEFAULT 24
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT
);

-- CreateTable
CREATE TABLE "ScheduleRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    CONSTRAINT "ScheduleRule_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DateOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    CONSTRAINT "DateOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "locationType" TEXT NOT NULL DEFAULT 'google_meet',
    "locationDetail" TEXT,
    "scheduleId" TEXT NOT NULL,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "periodType" TEXT NOT NULL DEFAULT 'unlimited',
    "periodDays" INTEGER,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "slotIntervalMinutes" INTEGER,
    "seats" INTEGER,
    "dailyCap" INTEGER,
    "firstSlotOnly" BOOLEAN NOT NULL DEFAULT false,
    "lockTimezone" BOOLEAN NOT NULL DEFAULT false,
    "allowGuests" BOOLEAN NOT NULL DEFAULT true,
    "collectPhone" TEXT NOT NULL DEFAULT 'hidden',
    "showNotes" BOOLEAN NOT NULL DEFAULT true,
    "neutralTitle" TEXT,
    "cancelWindowHours" INTEGER,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'aud',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "consents" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventType_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Question_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventTypeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startUtc" DATETIME NOT NULL,
    "endUtc" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "manageToken" TEXT NOT NULL,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "consents" TEXT NOT NULL DEFAULT '{}',
    "checklistAcks" TEXT NOT NULL DEFAULT '[]',
    "guests" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "phone" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "rescheduledFromId" TEXT,
    "linkId" TEXT,
    "reminder24hSentAt" DATETIME,
    "reminder1hSentAt" DATETIME,
    "googleEventId" TEXT,
    "meetUrl" TEXT,
    "googleSyncError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Upload_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SingleUseLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "note" TEXT,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SingleUseLink_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailLog" (
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

-- CreateIndex
CREATE UNIQUE INDEX "EventType_slug_key" ON "EventType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_manageToken_key" ON "Booking"("manageToken");

-- CreateIndex
CREATE INDEX "Booking_startUtc_idx" ON "Booking"("startUtc");

-- CreateIndex
CREATE INDEX "Booking_eventTypeId_startUtc_idx" ON "Booking"("eventTypeId", "startUtc");

-- CreateIndex
CREATE UNIQUE INDEX "SingleUseLink_token_key" ON "SingleUseLink"("token");

