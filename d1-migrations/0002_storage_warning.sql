-- Storage warnings: highest threshold already emailed (0, 70, 90)
ALTER TABLE "Settings" ADD COLUMN "storageWarnedLevel" INTEGER NOT NULL DEFAULT 0;
