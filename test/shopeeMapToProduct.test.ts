import { describe, expect, it } from "vitest";
import { mapToProduct } from "../src/sources/shopee/mapToProduct.js";
import type { ShopeeOffer } from "../src/sources/shopee/schemas.js";

const offer: ShopeeOffer = {
  itemId: 22812345678,
  productName: "Suporte Celular Carro Magnético",
  priceMin: "29.9",
  ratingStar: "4.9",
  sales: 5000,
  imageUrl: "https://down-br.img.susercontent.com/file/abc",
  shopType: [2],
  productLink: "https://shopee.com.br/product/1/22812345678",
  offerLink: "https://s.shopee.com.br/abc123",
};

describe("mapToProduct (Shopee)", () => {
  it("converte a oferta em produto e guarda o link de afiliado", () => {
    const mapped = mapToProduct(offer);
    expect(mapped?.product).toEqual({
      source: "shopee",
      id: "22812345678",
      title: "Suporte Celular Carro Magnético",
      price: 29.9,
      currency: "BRL",
      url: "https://shopee.com.br/product/1/22812345678",
      imageUrl: "https://down-br.img.susercontent.com/file/abc",
      officialStore: false,
    });
    expect(mapped?.affiliateUrl).toBe("https://s.shopee.com.br/abc123");
  });

  it("marca loja oficial quando shopType inclui 1", () => {
    expect(mapToProduct({ ...offer, shopType: [1, 4] })?.product.officialStore).toBe(true);
    expect(mapToProduct({ ...offer, shopType: null })?.product.officialStore).toBe(false);
  });

  it("descarta link de afiliado fora da Shopee Brasil ou sem https", () => {
    expect(mapToProduct({ ...offer, offerLink: "https://encurtador.example/abc" })).toBeNull();
    expect(mapToProduct({ ...offer, offerLink: "http://s.shopee.com.br/abc" })).toBeNull();
    expect(mapToProduct({ ...offer, offerLink: "https://shopee.com.br.golpe.example/abc" })).toBeNull();
    expect(mapToProduct({ ...offer, offerLink: null })).toBeNull();
  });

  it("descarta preço inválido", () => {
    expect(mapToProduct({ ...offer, priceMin: "abc" })).toBeNull();
    expect(mapToProduct({ ...offer, priceMin: "0" })).toBeNull();
  });
});
