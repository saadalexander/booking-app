/** Local / Node.js database: SQLite file through the libSQL adapter. */
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  }
  return globalForPrisma.prisma;
}
