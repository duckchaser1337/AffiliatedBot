import { describe, expect, it } from "vitest";
import { mapToProduct } from "../src/sources/mercadolivre/mapToProduct.js";
import type { MlItem } from "../src/sources/mercadolivre/schemas.js";

const item: MlItem = {
  id: "MLB123",
  title: "Aspirador Automotivo",
  price: 99.9,
  currency_id: "BRL",
  permalink: "https://produto.mercadolivre.com.br/MLB123",
  available_quantity: 3,
  status: "active",
  thumbnail: "https://http2.mlstatic.com/D_123-I.jpg",
};

describe("mapToProduct (Mercado Livre)", () => {
  it("prefere a foto em tamanho cheio à miniatura", () => {
    const product = mapToProduct({ ...item, pictures: [{ secure_url: "https://http2.mlstatic.com/D_123-O.jpg" }] });
    expect(product?.imageUrl).toBe("https://http2.mlstatic.com/D_123-O.jpg");
  });

  it("usa a miniatura quando não há foto válida", () => {
    expect(mapToProduct(item)?.imageUrl).toBe("https://http2.mlstatic.com/D_123-I.jpg");
    expect(mapToProduct({ ...item, pictures: [{ secure_url: "não é url" }] })?.imageUrl).toBe(
      "https://http2.mlstatic.com/D_123-I.jpg",
    );
  });

  it("marca loja oficial e ignora item inativo", () => {
    expect(mapToProduct({ ...item, official_store_id: 42 })?.officialStore).toBe(true);
    expect(mapToProduct({ ...item, status: "paused" })).toBeNull();
  });
});
