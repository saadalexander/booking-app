-- One-click deploys: self-generated secrets, dashboard-entered Google keys, recorded site address
ALTER TABLE "Settings" ADD COLUMN "siteUrl" TEXT;
CREATE TABLE "AppSecret" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
