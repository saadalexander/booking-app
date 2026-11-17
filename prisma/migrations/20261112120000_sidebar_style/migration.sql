-- Dashboard sidebar look: dark | light
ALTER TABLE "Settings" ADD COLUMN "sidebarStyle" TEXT NOT NULL DEFAULT 'dark';
