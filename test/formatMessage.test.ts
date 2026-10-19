import { describe, expect, it } from "vitest";
import { formatOfferMessage } from "../src/channels/telegram/formatMessage.js";
import type { Product } from "../src/sources/types.js";

const baseProduct: Product = {
  source: "mercadolivre",
  id: "MLB66585314",
  title:
    "Suporte Magnético Para Celular Com Ventosa De Vácuo Ajustável 360° Universal Para Carro Painel Vidro Mesa E Superfícies Com Fixação Forte Para Smartphone E Uso Veicular E Ajuste Prático - Swave",
  price: 17.99,
  currency: "BRL",
  url: "https://www.mercadolivre.com.br/p/MLB66585314",
};

const affiliateUrl = "https://www.mercadolivre.com.br/p/MLB66585314?pdp_filters=item_id%3AMLB1&matt_word=ag&matt_tool=1";

describe("formatOfferMessage", () => {
  it("segue o padrão do canal", () => {
    const message = formatOfferMessage({ product: baseProduct, affiliateUrl, discountPercent: 0 });
    expect(message).toBe(
      "🤯ACHADO DE GARAGEM🤯\n\n" +
        "Suporte Magnético Para Celular Com Ventosa De Vácuo Ajustável 360° Universal\n" +
        "<b>Por apenas - R$17,99</b>\n\n" +
        '<a href="https://www.mercadolivre.com.br/p/MLB66585314?pdp_filters=item_id%3AMLB1&amp;matt_word=ag&amp;matt_tool=1">Ver Oferta</a>',
    );
  });

  it("queda de preço sai no mesmo padrão", () => {
    const drop = formatOfferMessage({ product: baseProduct, affiliateUrl, discountPercent: 30 });
    expect(drop).toBe(formatOfferMessage({ product: baseProduct, affiliateUrl, discountPercent: 0 }));
  });

  it("escapa caracteres HTML do título", () => {
    const product = { ...baseProduct, title: "Fone de ouvido <bluetooth> & cia" };
    const message = formatOfferMessage({ product, affiliateUrl, discountPercent: 0 });
    expect(message).toContain("Fone de ouvido &lt;bluetooth&gt; &amp; cia\n");
  });

  it("formata o preço sem espaço depois do R$", () => {
    const product = { ...baseProduct, price: 1299.9 };
    expect(formatOfferMessage({ product, affiliateUrl, discountPercent: 0 })).toContain("<b>Por apenas - R$1.299,90</b>");
  });

  it("mantém a mensagem dentro do limite de caption do Telegram", () => {
    const longTitleProduct = { ...baseProduct, title: "A".repeat(2000) };
    const message = formatOfferMessage({ product: longTitleProduct, affiliateUrl, discountPercent: 20 });
    expect(message.length).toBeLessThanOrEqual(1024);
  });
});
