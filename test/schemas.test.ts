import { describe, expect, it } from "vitest";
import { mlItemSchema } from "../src/sources/mercadolivre/schemas.js";

const validItem = {
  id: "MLB123",
  title: "Produto",
  price: 100,
  currency_id: "BRL",
  permalink: "https://produto.mercadolivre.com.br/MLB123",
  available_quantity: 1,
  status: "active",
};

describe("mlItemSchema", () => {
  it("aceita um item válido", () => {
    expect(mlItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("rejeita item sem preço", () => {
    const { price: _price, ...withoutPrice } = validItem;
    expect(mlItemSchema.safeParse(withoutPrice).success).toBe(false);
  });

  it("aceita official_store_id numérico, nulo ou ausente", () => {
    expect(mlItemSchema.safeParse({ ...validItem, official_store_id: 123 }).success).toBe(true);
    expect(mlItemSchema.safeParse({ ...validItem, official_store_id: null }).success).toBe(true);
  });

  it("rejeita preço negativo", () => {
    expect(mlItemSchema.safeParse({ ...validItem, price: -5 }).success).toBe(false);
  });
});
