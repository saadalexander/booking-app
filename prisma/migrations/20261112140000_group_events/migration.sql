-- Group events people register for
-- CreateTable
CREATE TABLE "GroupEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startUtc" DATETIME NOT NULL,
    "endUtc" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "locationType" TEXT NOT NULL DEFAULT 'google_meet',
    "locationDetail" TEXT,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'published',
    "googleEventId" TEXT,
    "meetUrl" TEXT,
    "googleSyncError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Melbourne',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "manageToken" TEXT NOT NULL,
    "reminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GroupEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventRegistration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupEvent_slug_key" ON "GroupEvent"("slug");

-- CreateIndex
CREATE INDEX "GroupEvent_startUtc_idx" ON "GroupEvent"("startUtc");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_manageToken_key" ON "EventRegistration"("manageToken");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_email_key" ON "EventRegistration"("eventId", "email");

