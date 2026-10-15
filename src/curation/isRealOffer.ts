import type { ItemHistory } from "./priceHistory.js";

export interface RealOfferResult {
  isReal: boolean;
  reason: string;
  discountPercent?: number;
}

export function isRealOffer(
  history: ItemHistory | undefined,
  currentPrice: number,
  thresholdPercent: number,
): RealOfferResult {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { isReal: false, reason: "preço inválido" };
  }
  if (!history || history.observations.length === 0) {
    return { isReal: false, reason: "primeira observação, ainda sem histórico" };
  }
  if (currentPrice >= history.minPrice) {
    return { isReal: false, reason: "preço não está abaixo do mínimo histórico" };
  }

  const discountPercent = ((history.minPrice - currentPrice) / history.minPrice) * 100;
  if (discountPercent < thresholdPercent) {
    return {
      isReal: false,
      reason: `queda de ${discountPercent.toFixed(1)}% abaixo do limiar de ${thresholdPercent}%`,
      discountPercent,
    };
  }

  return {
    isReal: true,
    reason: `queda de ${discountPercent.toFixed(1)}% abaixo do mínimo histórico`,
    discountPercent,
  };
}
