import type { PrismaClient } from "@/generated/prisma/client";
// "db-runtime" resolves to ./db-node.ts normally and to ./db-cf.ts in Cloudflare builds.
import { getClient } from "db-runtime";

/**
 * The app's database client. A thin proxy so every call picks up the right client for the
 * current runtime (a shared libSQL client locally, a per-request D1 client on Cloudflare).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
