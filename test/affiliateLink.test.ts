import { describe, expect, it } from "vitest";
import { buildAffiliateLink } from "../src/sources/mercadolivre/affiliateLink.js";

describe("buildAffiliateLink", () => {
  it("anexa matt_word e matt_tool preservando query params existentes", () => {
    const url = buildAffiliateLink("https://produto.mercadolivre.com.br/MLB123?ref=x", "MEUTAG", "12345");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("matt_word")).toBe("MEUTAG");
    expect(parsed.searchParams.get("matt_tool")).toBe("12345");
    expect(parsed.searchParams.get("ref")).toBe("x");
  });

  it("rejeita domínio que não é do Mercado Livre", () => {
    expect(() => buildAffiliateLink("https://evil.com/product", "MEUTAG", "12345")).toThrow();
  });
});
