import { logger } from "../../logger.js";
import type { Product } from "../types.js";
import type { ShopeeOffer } from "./schemas.js";

const OFFICIAL_SHOP = 1;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// O link de afiliado vai direto pros canais: só aceita https num domínio da Shopee Brasil.
function isShopeeLink(value: string): boolean {
  const url = parseUrl(value);
  return (
    url !== null &&
    url.protocol === "https:" &&
    (url.hostname === "shopee.com.br" || url.hostname.endsWith(".shopee.com.br"))
  );
}

export interface MappedOffer {
  product: Product;
  affiliateUrl: string;
}

export function mapToProduct(offer: ShopeeOffer): MappedOffer | null {
  const id = String(offer.itemId);
  const price = Number(offer.priceMin);
  if (!Number.isFinite(price) || price <= 0) {
    logger.warn("Oferta da Shopee com preço inválido, ignorando", { itemId: id, priceMin: offer.priceMin });
    return null;
  }
  if (!offer.offerLink || !isShopeeLink(offer.offerLink)) {
    logger.warn("Oferta da Shopee sem link de afiliado válido, ignorando", { itemId: id, offerLink: offer.offerLink });
    return null;
  }
  return {
    product: {
      source: "shopee",
      id,
      title: offer.productName,
      price,
      currency: "BRL",
      url: offer.productLink,
      imageUrl: offer.imageUrl && parseUrl(offer.imageUrl) ? offer.imageUrl : undefined,
      officialStore: offer.shopType?.includes(OFFICIAL_SHOP) ?? false,
    },
    affiliateUrl: offer.offerLink,
  };
}
