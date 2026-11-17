import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic (live availability), so no incremental cache is needed.
export default defineCloudflareConfig({});
