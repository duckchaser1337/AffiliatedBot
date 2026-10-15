import { describe, expect, it } from "vitest";
import { isRealOffer } from "../src/curation/isRealOffer.js";
import type { ItemHistory } from "../src/curation/priceHistory.js";

describe("isRealOffer", () => {
  it("rejeita quando não há histórico ainda", () => {
    expect(isRealOffer(undefined, 100, 15).isReal).toBe(false);
  });

  it("rejeita quando o preço é igual ao mínimo histórico", () => {
    const history: ItemHistory = { observations: [{ price: 100, observedAt: "2026-01-01" }], minPrice: 100 };
    expect(isRealOffer(history, 100, 15).isReal).toBe(false);
  });

  it("rejeita queda abaixo do limiar configurado", () => {
    const history: ItemHistory = { observations: [{ price: 100, observedAt: "2026-01-01" }], minPrice: 100 };
    expect(isRealOffer(history, 90, 15).isReal).toBe(false);
  });

  it("aceita queda igual ou acima do limiar", () => {
    const history: ItemHistory = { observations: [{ price: 100, observedAt: "2026-01-01" }], minPrice: 100 };
    const result = isRealOffer(history, 80, 15);
    expect(result.isReal).toBe(true);
    expect(result.discountPercent).toBeCloseTo(20);
  });

  it("rejeita preço inválido sem quebrar", () => {
    const history: ItemHistory = { observations: [{ price: 100, observedAt: "2026-01-01" }], minPrice: 100 };
    expect(isRealOffer(history, -10, 15).isReal).toBe(false);
    expect(isRealOffer(history, Number.NaN, 15).isReal).toBe(false);
  });
});
