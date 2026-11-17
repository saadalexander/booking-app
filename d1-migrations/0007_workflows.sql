-- Automations (email workflows)
-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "recipient" TEXT NOT NULL DEFAULT 'client',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "eventTypeIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkflowSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowSend_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowSend_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Built-in reminder switch
ALTER TABLE "Settings" ADD COLUMN "builtInReminders" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "WorkflowSend_bookingId_idx" ON "WorkflowSend"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSend_workflowId_bookingId_key" ON "WorkflowSend"("workflowId", "bookingId");

