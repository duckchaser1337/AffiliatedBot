import { describe, expect, it } from "vitest";
import { AFFILIATE_DISCLOSURE } from "../src/content/disclosure.js";
import { shortTitle } from "../src/content/format.js";
import { buildKitInstructions, buildTikTokCaption } from "../src/tiktok/caption.js";
import type { KitOffer } from "../src/tiktok/kitLog.js";

const offer: KitOffer = {
  key: "mercadolivre:MLB1",
  product: {
    source: "mercadolivre",
    id: "MLB1",
    title: "Compressor de Ar Portátil Automotivo 12V Digital com Lanterna",
    price: 129.9,
    currency: "BRL",
    url: "https://produto.mercadolivre.com.br/MLB1",
  },
  affiliateUrl: "https://produto.mercadolivre.com.br/MLB1?matt_word=x",
  discountPercent: 21.4,
  previousPrice: 165.3,
  foundAt: "2026-10-19T10:00:00Z",
};

describe("buildTikTokCaption", () => {
  it("começa com a identificação de publicidade e traz preço, queda e hashtags", () => {
    const caption = buildTikTokCaption(offer, ["#achadodegaragem", "#carro"]);
    expect(caption.startsWith(AFFILIATE_DISCLOSURE)).toBe(true);
    // O formato de moeda do Node usa espaço não separável entre "R$" e o valor.
    expect(caption).toMatch(/R\$\s129,90/);
    expect(caption).toContain("baixou 21%");
    expect(caption).toContain("#achadodegaragem #carro");
  });

  it("não fala em queda quando não houve", () => {
    expect(buildTikTokCaption({ ...offer, discountPercent: 0 }, [])).not.toContain("baixou");
  });
});

describe("buildKitInstructions", () => {
  it("traz o passo a passo, o preço anterior e o link de afiliado", () => {
    const text = buildKitInstructions(offer, "2026-10-19 09:00");
    expect(text).toContain("Kit do TikTok · 2026-10-19 09:00");
    expect(text).toContain("TikTok Shop");
    expect(text).toMatch(/antes R\$\s165,30/);
    expect(text).toContain("Link de afiliado (Mercado Livre): https://produto.mercadolivre.com.br/MLB1?matt_word=x");
  });
});

describe("buildKitInstructions (achado do dia)", () => {
  it("avisa que não houve queda e que o produto já está no canal", () => {
    const text = buildKitInstructions({ ...offer, discountPercent: 0, previousPrice: undefined }, "2026-10-19 09:00");
    expect(text).toContain("achado do dia, sem queda de preço");
    expect(text).not.toContain("antes");
  });
});

describe("shortTitle", () => {
  it("corta no último espaço e marca com reticências", () => {
    expect(shortTitle("Suporte Celular Carro Magnético Saída de Ar", 25)).toBe("Suporte Celular Carro…");
    expect(shortTitle("Curto", 25)).toBe("Curto");
  });
});
