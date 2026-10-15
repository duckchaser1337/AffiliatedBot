import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../src/sources/mercadolivre/tokenStore.js";

const KEY = randomBytes(32).toString("base64");

describe("tokenStore encryption", () => {
  it("faz round-trip do refresh token", () => {
    const blob = encryptToken("TG-abc123", KEY);
    expect(decryptToken(blob, KEY)).toBe("TG-abc123");
  });

  it("rejeita um blob adulterado", () => {
    const blob = encryptToken("TG-abc123", KEY);
    const parsed = JSON.parse(blob);
    parsed.ciphertext = Buffer.from("adulterado adulterado").toString("base64");
    expect(() => decryptToken(JSON.stringify(parsed), KEY)).toThrow();
  });

  it("falha com a chave errada", () => {
    const blob = encryptToken("TG-abc123", KEY);
    const wrongKey = randomBytes(32).toString("base64");
    expect(() => decryptToken(blob, wrongKey)).toThrow();
  });
});
