import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Falls back to the local file, so `npm install` (prisma generate) works on a fresh copy without .env.
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
