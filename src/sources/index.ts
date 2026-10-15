import { createMercadoLivreSource } from "./mercadolivre/index.js";
import { createShopeeSource } from "./shopee/index.js";
import type { Source, SourceId } from "./types.js";

const factories: Record<SourceId, () => Source> = {
  mercadolivre: createMercadoLivreSource,
  shopee: createShopeeSource,
};

export function createSources(ids: readonly SourceId[]): Source[] {
  return ids.map((id) => factories[id]());
}
