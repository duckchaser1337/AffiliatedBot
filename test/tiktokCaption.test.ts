import { describe, expect, it } from "vitest";
import { productHeadline } from "../src/content/format.js";
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
  it("traz título, preço, queda e hashtags, sem #publi no texto", () => {
    const caption = buildTikTokCaption(offer, ["#achadodegaragem", "#carro"]);
    expect(caption.startsWith("Compressor de Ar Portátil")).toBe(true);
    expect(caption).not.toContain("#publi");
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

describe("productHeadline", () => {
  const longTitle =
    "Suporte Magnético Para Celular Com Ventosa De Vácuo Ajustável 360° Universal Para Carro Painel Vidro Mesa E Superfícies Com Fixação Forte Para Smartphone E Uso Veicular E Ajuste Prático - Swave";

  it("fica com as palavras-chave do começo, sem reticências", () => {
    expect(productHeadline(longTitle, 80)).toBe(
      "Suporte Magnético Para Celular Com Ventosa De Vácuo Ajustável 360° Universal",
    );
  });

  it("não termina em conector", () => {
    expect(productHeadline("Shampoo Automotivo Neutro Com Cera Para Carro E Moto Lavagem Completa", 40)).toBe(
      "Shampoo Automotivo Neutro Com Cera",
    );
  });

  it("título curto fica igual e palavra gigante é cortada", () => {
    expect(productHeadline("Cera Automotiva  Vonixx - 500ml", 80)).toBe("Cera Automotiva Vonixx - 500ml");
    expect(productHeadline("A".repeat(100), 10)).toBe("AAAAAAAAAA");
  });
});
