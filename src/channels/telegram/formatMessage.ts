import { formatBRL, productHeadline } from "../../content/format.js";
import type { ProductPost } from "../types.js";

// Título enxuto: o nome completo dos marketplaces vira um parágrafo no post.
const MAX_TITLE_LENGTH = 80;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Sem a linha "#publi · link de afiliado": decisão do dono do canal (19/10/2026), ciente do
// art. 36 do CDC e do guia do CONAR; a descrição do canal menciona a comissão.
export function formatOfferMessage({ product, affiliateUrl, discountPercent }: ProductPost): string {
  const title = escapeHtml(productHeadline(product.title, MAX_TITLE_LENGTH));
  const price = formatBRL(product.price);
  // Sem queda de preço é o "Achado do dia" do kit do TikTok, que também vem pro canal.
  const priceLine =
    discountPercent >= 1 ? `${discountPercent.toFixed(0)}% de queda — por ${price}` : `Achado do dia — por ${price}`;
  return `<b>${title}</b>\n\n${priceLine}\n\n<a href="${affiliateUrl}">Ver oferta</a>`;
}
