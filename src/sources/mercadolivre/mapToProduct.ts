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
    // Fotos vêm soltas no schema (não queremos rejeitar a oferta inteira por causa
    // de uma imagem malformada) — valida aqui, na borda antes de virar foto nos canais.
    // A primeira de pictures tem tamanho cheio; thumbnail (~90px) fica só de reserva.
    imageUrl: [item.pictures?.[0]?.secure_url, item.thumbnail].find(
      (url): url is string => url !== undefined && isValidUrl(url),
    ),
    officialStore: item.official_store_id != null,
  };
}
