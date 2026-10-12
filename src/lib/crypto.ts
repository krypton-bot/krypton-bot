import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/db";

let cached: Buffer | null = null;

/**
 * Local AES-256 key. Use CREDENTIALS_KEY (64 hex chars) if you want to manage it yourself; otherwise one is
 * generated on first use and kept in ./data/.secret (owner-only permissions). Never leaves this machine.
 */
function key() {
  if (cached) return cached;
  const env = process.env.CREDENTIALS_KEY ?? "";
  if (env) {
    if (!/^[0-9a-f]{64}$/i.test(env)) throw new Error("CREDENTIALS_KEY must be 64 hex chars (openssl rand -hex 32)");
    return (cached = Buffer.from(env, "hex"));
  }
  const file = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  return (cached = Buffer.from(readFileSync(file, "utf8").trim(), "hex"));
}

/** AES-256-GCM. Output: base64(iv[12] | tag[16] | ciphertext). `aad` binds the ciphertext to its row. */
export function encrypt(plain: string, aad?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  if (aad) c.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(payload: string, aad?: string): string {
  const buf = Buffer.from(payload, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  if (aad) d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
