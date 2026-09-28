import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

/**
 * File storage abstraction. The default backend writes to a local directory
 * (mount a persistent volume in production). Swap `storage` for an S3/GCS
 * implementation of the same interface if the app is deployed to a serverless host.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[a-f0-9-]{36}\.(pdf|jpg|jpeg|png|doc|docx)$/;

function resolveKey(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
  const full = path.join(config.storageDir, key);
  if (!full.startsWith(config.storageDir + path.sep)) throw new Error("Invalid storage key");
  return full;
}

class LocalStorage implements FileStorage {
  async put(key: string, data: Buffer) {
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { flag: "wx", mode: 0o640 }); // never overwrite an original
  }
  async get(key: string) {
    return fs.readFile(resolveKey(key));
  }
  async remove(key: string) {
    await fs.rm(resolveKey(key), { force: true });
  }
}

export const storage: FileStorage = new LocalStorage();
