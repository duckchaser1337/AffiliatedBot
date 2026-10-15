import { describe, expect, it } from "vitest";
import { emptyState, recordObservation } from "../src/curation/priceHistory.js";

describe("recordObservation", () => {
  it("registra a primeira observação e não tem mínimo anterior", () => {
    const { state, previousMinPrice } = recordObservation(emptyState(), "MLB1", 100);
    expect(previousMinPrice).toBeUndefined();
    expect(state.items.MLB1.minPrice).toBe(100);
  });

  it("atualiza o mínimo quando o preço cai", () => {
    const first = recordObservation(emptyState(), "MLB1", 100);
    const second = recordObservation(first.state, "MLB1", 80);
    expect(second.previousMinPrice).toBe(100);
    expect(second.state.items.MLB1.minPrice).toBe(80);
  });

  it("mantém o mínimo quando o preço sobe", () => {
    const first = recordObservation(emptyState(), "MLB1", 80);
    const second = recordObservation(first.state, "MLB1", 100);
    expect(second.state.items.MLB1.minPrice).toBe(80);
  });

  it("poda observações antigas além do limite", () => {
    let state = emptyState();
    for (let i = 0; i < 100; i++) {
      state = recordObservation(state, "MLB1", 100 + i).state;
    }
    expect(state.items.MLB1.observations.length).toBeLessThanOrEqual(90);
  });
});
