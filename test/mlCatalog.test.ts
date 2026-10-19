import { describe, expect, it } from "vitest";
import { catalogUrl, mapToProduct, pickOffer } from "../src/sources/mercadolivre/mapToProduct.js";

describe("pickOffer", () => {
  it("escolhe a oferta nova mais barata e ignora usados", () => {
    const offer = pickOffer([
      { item_id: "MLB1", price: 50, condition: "new" },
      { item_id: "MLB2", price: 30, condition: "used" },
      { item_id: "MLB3", price: 45, condition: "new" },
    ]);
    expect(offer?.item_id).toBe("MLB3");
  });

  it("sem oferta nova não há o que publicar", () => {
    expect(pickOffer([])).toBeUndefined();
    expect(pickOffer([{ item_id: "MLB2", price: 30, condition: "refurbished" }])).toBeUndefined();
  });
});

describe("mapToProduct (catálogo do Mercado Livre)", () => {
  it("usa o preço e a loja da oferta escolhida e aponta pra página com ela selecionada", () => {
    const product = mapToProduct(
      { id: "MLB25804364", name: "Serra Tico Tico", pictures: [{ url: "não é url" }, { url: "https://http2.mlstatic.com/a.jpg" }] },
      { item_id: "MLB5724999614", price: 103.69, condition: "new", official_store_id: 42 },
    );
    expect(product).toEqual({
      source: "mercadolivre",
      id: "MLB25804364",
      title: "Serra Tico Tico",
      price: 103.69,
      currency: "BRL",
      url: "https://www.mercadolivre.com.br/p/MLB25804364?pdp_filters=item_id%3AMLB5724999614",
      imageUrl: "https://http2.mlstatic.com/a.jpg",
      officialStore: true,
    });
  });

  it("catalogUrl seleciona a oferta pelo item_id", () => {
    expect(new URL(catalogUrl("MLB1", "MLB9")).searchParams.get("pdp_filters")).toBe("item_id:MLB9");
  });
});
