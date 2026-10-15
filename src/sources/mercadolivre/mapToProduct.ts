import type { Product } from "../types.js";
import type { MlItem } from "./schemas.js";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function mapToProduct(item: MlItem): Product | null {
  if (item.status !== "active") {
    return null;
  }
  return {
    source: "mercadolivre",
    id: item.id,
    title: item.title,
    price: item.price,
    currency: item.currency_id,
    url: item.permalink,
    // thumbnail vem solto no schema (não queremos rejeitar a oferta inteira por causa
    // de uma miniatura malformada) — valida aqui, na borda antes de virar foto nos canais.
    imageUrl: item.thumbnail && isValidUrl(item.thumbnail) ? item.thumbnail : undefined,
    officialStore: item.official_store_id != null,
  };
}
