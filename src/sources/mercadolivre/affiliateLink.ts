export function buildAffiliateLink(permalink: string, mattWord: string, mattTool: string): string {
  const url = new URL(permalink);
  const isMercadoLivreDomain =
    url.hostname.endsWith(".mercadolivre.com.br") ||
    url.hostname === "mercadolivre.com.br" ||
    url.hostname.endsWith(".mercadolibre.com");
  if (!isMercadoLivreDomain) {
    throw new Error(`URL não é um domínio do Mercado Livre: ${permalink}`);
  }
  url.searchParams.set("matt_word", mattWord);
  url.searchParams.set("matt_tool", mattTool);
  return url.toString();
}
