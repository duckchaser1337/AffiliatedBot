import { AFFILIATE_DISCLOSURE } from "../../content/disclosure.js";
import { formatBRL } from "../../content/format.js";
import type { ProductPost } from "../types.js";

const MAX_CAPTION_LENGTH = 1024;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildMessage(title: string, { product, affiliateUrl, discountPercent }: ProductPost): string {
  const price = formatBRL(product.price);
  const discount = discountPercent.toFixed(0);
  return (
    `${AFFILIATE_DISCLOSURE}\n\n` +
    `<b>${title}</b>\n\n` +
    `${discount}% de queda — por ${price}\n\n` +
    `<a href="${affiliateUrl}">Ver oferta</a>`
  );
}

export function formatOfferMessage(post: ProductPost): string {
  const { title } = post.product;
  let message = buildMessage(escapeHtml(title), post);

  if (message.length > MAX_CAPTION_LENGTH) {
    const overflow = message.length - MAX_CAPTION_LENGTH;
    const maxTitleLength = Math.max(title.length - overflow - 1, 0);
    const truncatedTitle = escapeHtml(`${title.slice(0, maxTitleLength)}…`);
    message = buildMessage(truncatedTitle, post);
  }

  return message;
}
