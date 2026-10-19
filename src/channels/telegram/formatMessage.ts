import { formatBRL, productHeadline } from "../../content/format.js";
import type { ProductPost } from "../types.js";

// Título enxuto: o nome completo dos marketplaces vira um parágrafo no post.
const MAX_TITLE_LENGTH = 80;

// O parse_mode HTML do Telegram exige &, < e > escapados fora das tags, inclusive nos links
// (os de afiliado têm & entre os parâmetros).
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Padrão definido pelo dono do canal (19/10/2026), igual pra queda de preço e "Achado do dia":
//
//   🤯ACHADO DE GARAGEM🤯
//
//   <título enxuto>
//   **Por apenas - R$17,99**
//
//   Ver Oferta   (texto clicável; o link de afiliado é comprido demais pra aparecer)
//
// Sem "#publi": decisão do dono do canal, ciente do art. 36 do CDC e do guia do CONAR.
export function formatOfferMessage({ product, affiliateUrl }: ProductPost): string {
  const title = escapeHtml(productHeadline(product.title, MAX_TITLE_LENGTH));
  // "R$17,99", sem o espaço que o formato de moeda põe depois do R$.
  const price = formatBRL(product.price).replace(/\s/g, "");
  return (
    `🤯ACHADO DE GARAGEM🤯\n\n${title}\n<b>Por apenas - ${price}</b>\n\n` +
    `<a href="${escapeHtml(affiliateUrl)}">Ver Oferta</a>`
  );
}
