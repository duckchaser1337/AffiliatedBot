import { describe, expect, it } from "vitest";
import { formatOfferMessage } from "../src/channels/telegram/formatMessage.js";
import type { Product } from "../src/sources/types.js";

const baseProduct: Product = {
  source: "mercadolivre",
  id: "MLB123",
  title: "Fone de ouvido <bluetooth> & cia",
  price: 89.9,
  currency: "BRL",
  url: "https://produto.mercadolivre.com.br/MLB123",
};

describe("formatOfferMessage", () => {
  it("escapa caracteres HTML do título", () => {
    const message = formatOfferMessage({ product: baseProduct, affiliateUrl: "https://x.com", discountPercent: 20 });
    expect(message).not.toContain("<bluetooth>");
    expect(message).toContain("&lt;bluetooth&gt;");
    expect(message).toContain("&amp;");
  });

  it("formata o preço em BRL", () => {
    const message = formatOfferMessage({ product: baseProduct, affiliateUrl: "https://x.com", discountPercent: 20 });
    expect(message).toContain("R$");
    expect(message).toContain("89,90");
  });

  it("sem queda de preço vira Achado do dia", () => {
    const message = formatOfferMessage({ product: baseProduct, affiliateUrl: "https://x.com", discountPercent: 0 });
    expect(message).toContain("Achado do dia — por");
    expect(message).not.toContain("de queda");
  });

  it("começa direto pelo título, sem linha de #publi", () => {
    const message = formatOfferMessage({ product: baseProduct, affiliateUrl: "https://x.com", discountPercent: 20 });
    expect(message.startsWith("<b>Fone de ouvido")).toBe(true);
    expect(message).not.toContain("#publi");
  });

  it("encurta o título nas palavras-chave do produto", () => {
    const product = {
      ...baseProduct,
      title:
        "Suporte Magnético Para Celular Com Ventosa De Vácuo Ajustável 360° Universal Para Carro Painel Vidro Mesa E Superfícies Com Fixação Forte Para Smartphone E Uso Veicular E Ajuste Prático - Swave",
    };
    const message = formatOfferMessage({ product, affiliateUrl: "https://x.com", discountPercent: 0 });
    expect(message).toContain("<b>Suporte Magnético Para Celular Com Ventosa De Vácuo Ajustável 360° Universal</b>");
  });

  it("mantém a mensagem dentro do limite de caption do Telegram", () => {
    const longTitleProduct = { ...baseProduct, title: "A".repeat(2000) };
    const message = formatOfferMessage({ product: longTitleProduct, affiliateUrl: "https://x.com", discountPercent: 20 });
    expect(message.length).toBeLessThanOrEqual(1024);
  });
});
