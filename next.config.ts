import type { NextConfig } from "next";

// Cache Components is off on purpose: a booking app shows live availability, so pages
// that read the database opt into dynamic rendering explicitly (`dynamic = "force-dynamic"`).
// See node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md

// CF_BUILD=1 (set by `npm run cf:build`) builds for Cloudflare Workers: the database module
// switches from the local libSQL file (db-node) to Cloudflare D1 (db-cf).
const cloudflare = process.env.CF_BUILD === "1";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "db-runtime": cloudflare ? "./src/lib/db-cf.ts" : "./src/lib/db-node.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: cloudflare ? [] : ["@libsql/client", "libsql"],
  // Cloudflare only: the Prisma workerd client imports its query-compiler .wasm through a loader with
  // a dynamic path, which makes file tracing pull in the whole project (57k files, ~19 MB gzipped —
  // over the Workers size limit). Nothing below is needed at runtime: dependencies are already
  // bundled into the server chunks, and the one wasm file needed lives in src/generated/prisma-cf.
  ...(cloudflare
    ? {
        // Bundle Prisma's runtime into the server chunks (Next externalizes @prisma/client by default,
        // which the Workers bundle can't resolve at runtime).
        transpilePackages: ["@prisma/client"],
        outputFileTracingExcludes: {
          "*": [
            "node_modules/prisma/**",
            "node_modules/@prisma/dev/**",
            "node_modules/@prisma/client/runtime/*.wasm",
            "node_modules/@prisma/client/runtime/*.wasm-base64.*",
            "node_modules/@prisma/engines/**",
            "node_modules/@prisma/schema-engine-wasm/**",
            "node_modules/@prisma/prisma-schema-wasm/**",
            "node_modules/@electric-sql/**",
            "node_modules/@libsql/**",
            "node_modules/libsql/**",
            "node_modules/@tailwindcss/**",
            "node_modules/tailwindcss/**",
            "node_modules/lightningcss*/**",
            "node_modules/blake3-wasm/**",
            "node_modules/next/dist/compiled/@vercel/og/**",
            "node_modules/eslint*/**",
            "node_modules/@eslint/**",
            "node_modules/@typescript-eslint/**",
            "node_modules/typescript/**",
            "node_modules/wrangler/**",
            "node_modules/miniflare/**",
            "node_modules/workerd/**",
            "node_modules/@cloudflare/**",
            "node_modules/esbuild/**",
            "node_modules/@esbuild/**",
            "node_modules/vitest/**",
            "node_modules/vite/**",
            "node_modules/@vitest/**",
            "node_modules/rollup/**",
            "node_modules/@rollup/**",
            "node_modules/@rolldown/**",
            "node_modules/@ast-grep/**",
            "node_modules/@swc/**",
            "node_modules/@aws-sdk/**",
            "node_modules/@smithy/**",
            "node_modules/@opennextjs/**",
            "node_modules/@img/**",
            "node_modules/sharp/**",
            "node_modules/.prisma/**",
            "src/generated/prisma/**",
            "prisma/**",
            "uploads/**",
            "*.db",
            ".wrangler/**",
            "d1-seed/**",
          ],
        },
      }
    : {}),
};

export default nextConfig;
