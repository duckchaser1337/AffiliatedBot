import { AFFILIATE_DISCLOSURE } from "../content/disclosure.js";
import { formatBRL, shortTitle } from "../content/format.js";
import type { SourceId } from "../sources/types.js";
import type { KitOffer } from "./kitLog.js";

const SOURCE_LABELS: Record<SourceId, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

function dropText(offer: KitOffer): string {
  return offer.discountPercent >= 1 ? ` (baixou ${offer.discountPercent.toFixed(0)}%)` : "";
}

// Legenda pronta pra colar no TikTok; a identificação de publicidade vem primeiro (CONAR).
export function buildTikTokCaption(offer: KitOffer, hashtags: readonly string[]): string {
  const line = `${shortTitle(offer.product.title, 70)} por ${formatBRL(offer.product.price)}${dropText(offer)}.`;
  return [AFFILIATE_DISCLOSURE, line, "Link na bio e no canal do Telegram.", "", hashtags.join(" ")].join("\n").trim();
}

export function buildKitInstructions(offer: KitOffer, slot: string): string {
  const previous = offer.previousPrice ? ` (antes ${formatBRL(offer.previousPrice)})` : "";
  return [
    `Kit do TikTok · ${slot}`,
    "",
    "1. Salve o vídeo acima e poste no TikTok com um som em alta (o som entra pelo app).",
    "2. Cole a legenda que veio junto com o vídeo.",
    "3. Na tela de postar, ative a divulgação de conteúdo comercial e marque \"Conteúdo de marca\": você ganha comissão de terceiros.",
    `4. Sacolinha: na vitrine de afiliado do TikTok Shop, procure "${shortTitle(offer.product.title, 40)}". Se achar, adicione o produto ao vídeo.`,
    "",
    `Produto: ${offer.product.title}`,
    `Preço: ${formatBRL(offer.product.price)}${previous}`,
    `Link de afiliado (${SOURCE_LABELS[offer.product.source]}): ${offer.affiliateUrl}`,
  ].join("\n");
}
