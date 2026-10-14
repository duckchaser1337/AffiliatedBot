import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface StoredToken {
  refreshToken: string;
  updatedAt: string;
}

interface EncryptedBlob {
  iv: string;
  authTag: string;
  ciphertext: string;
}

function getKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("ML_TOKEN_ENCRYPTION_KEY precisa decodificar para 32 bytes (chave AES-256)");
  }
  return key;
}

export function encryptToken(refreshToken: string, base64Key: string): string {
  const key = getKey(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload: StoredToken = { refreshToken, updatedAt: new Date().toISOString() };
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const blob: EncryptedBlob = {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(blob, null, 2);
}

export function decryptToken(fileContents: string, base64Key: string): string {
  const key = getKey(base64Key);
  const blob = JSON.parse(fileContents) as EncryptedBlob;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const payload = JSON.parse(plaintext) as StoredToken;
  return payload.refreshToken;
}

export async function readTokenFile(path: string, base64Key: string): Promise<string> {
  const contents = await readFile(path, "utf8");
  return decryptToken(contents, base64Key);
}

export async function writeTokenFile(filePath: string, refreshToken: string, base64Key: string): Promise<void> {
  const blob = encryptToken(refreshToken, base64Key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, blob, "utf8");
}
