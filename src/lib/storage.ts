import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private storage for client uploads — never public, never bundled.
 *  - Locally: files on disk under UPLOAD_DIR (owner-only permissions).
 *  - Cloudflare: the private R2 bucket bound as UPLOADS (STORAGE_BACKEND="r2").
 * Disk paths are runtime data, so they are excluded from build-time file tracing (`turbopackIgnore`).
 */
type R2Bucket = {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
};

const isR2 = () => process.env.STORAGE_BACKEND === "r2";

async function bucket(): Promise<R2Bucket> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const b = (getCloudflareContext().env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!b) throw new Error("R2 bucket binding UPLOADS is missing");
  return b;
}

function uploadDir() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR ?? "uploads");
}

function filePath(storedName: string) {
  return path.join(/* turbopackIgnore: true */ uploadDir(), path.basename(storedName));
}

export async function writeUpload(storedName: string, data: Buffer) {
  if (isR2()) {
    await (await bucket()).put(`uploads/${path.basename(storedName)}`, new Uint8Array(data));
    return;
  }
  await mkdir(/* turbopackIgnore: true */ uploadDir(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ filePath(storedName), data, { mode: 0o600 });
}

export async function readUpload(storedName: string): Promise<Buffer> {
  if (isR2()) {
    const obj = await (await bucket()).get(`uploads/${path.basename(storedName)}`);
    if (!obj) throw new Error("File not found in storage");
    return Buffer.from(await obj.arrayBuffer());
  }
  return readFile(/* turbopackIgnore: true */ filePath(storedName));
}

export async function deleteUpload(storedName: string) {
  if (isR2()) {
    await (await bucket()).delete(`uploads/${path.basename(storedName)}`).catch(() => {});
    return;
  }
  await unlink(/* turbopackIgnore: true */ filePath(storedName)).catch(() => {});
}
