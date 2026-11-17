/**
 * Cloudflare Workers database: D1 through the Prisma D1 adapter.
 * Swapped in for db-node.ts by the `db-runtime` alias in Cloudflare builds (see next.config.ts).
 * One client per request, as recommended for Workers.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient as CfPrismaClient } from "@/generated/prisma-cf/client";
import type { PrismaClient } from "@/generated/prisma/client";

const perRequest = new WeakMap<object, CfPrismaClient>();

export function getClient(): PrismaClient {
  const { env, ctx } = getCloudflareContext();
  let client = perRequest.get(ctx);
  if (!client) {
    client = new CfPrismaClient({ adapter: new PrismaD1((env as unknown as { DB: never }).DB) });
    perRequest.set(ctx, client);
  }
  return client as unknown as PrismaClient;
}
