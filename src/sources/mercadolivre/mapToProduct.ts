import type { Product } from "../types.js";
import type { MlCatalogProduct, MlOffer } from "./schemas.js";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// A oferta nova mais barata; usado e recondicionado ficam de fora.
export function pickOffer(offers: readonly MlOffer[]): MlOffer | undefined {
  return offers
    .filter((offer) => offer.condition === undefined || offer.condition === "new")
    .reduce<MlOffer | undefined>((best, offer) => (!best || offer.price < best.price ? offer : best), undefined);
}

// Página do produto com a oferta escolhida já selecionada (pdp_filters), pra que o preço
// do post bata com o da página: sem isso, o ML mostra o vendedor que ele escolher.
export function catalogUrl(productId: string, itemId: string): string {
  const url = new URL(`https://www.mercadolivre.com.br/p/${productId}`);
  url.searchParams.set("pdp_filters", `item_id:${itemId}`);
  return url.toString();
}

export function mapToProduct(product: MlCatalogProduct, offer: MlOffer): Product {
  return {
    source: "mercadolivre",
    id: product.id,
    title: product.name,
    price: offer.price,
    currency: "BRL",
    url: catalogUrl(product.id, offer.item_id),
    // Fotos vêm soltas no schema (uma imagem malformada não deve derrubar o produto).
    imageUrl: product.pictures?.map((picture) => picture.url).find((url): url is string => !!url && isValidUrl(url)),
    officialStore: offer.official_store_id != null,
  };
}
