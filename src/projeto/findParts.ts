import { checkNiche, type NicheRules } from "../curation/niche.js";
import { getCatalogProduct, getProductOffers, searchCatalog } from "../sources/mercadolivre/client.js";
import { mapToProduct, pickOffer } from "../sources/mercadolivre/mapToProduct.js";
import type { MlCatalogProduct } from "../sources/mercadolivre/schemas.js";
import type { Product } from "../sources/types.js";
import type { ProjectItem } from "./items.js";

const SEARCH_LIMIT = 30;
// Candidatos com vendedor ativo suficientes pra escolher a faixa de preço.
const MAX_CANDIDATES = 12;

export interface ProjectPart {
  item: ProjectItem;
  product?: Product;
  // De onde veio a peça, pro relatório.
  via: "busca" | "link";
  // Por que a peça ficou de fora, quando ficou.
  problem?: string;
}

// Tipo de produto mais frequente na busca (ex: VEHICLE_HEADLIGHTS pra "farol saveiro g6").
// Separa a peça de verdade do que só cita o nome dela: revitalizador, parafuso, lâmpada...
function dominantDomain(results: readonly MlCatalogProduct[]): string | undefined {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.domain_id) counts.set(result.domain_id, (counts.get(result.domain_id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function closestTo(candidates: Product[], target: number): Product {
  return candidates.reduce((best, product) =>
    Math.abs(product.price - target) < Math.abs(best.price - target) ? product : best,
  );
}

async function candidatesFor(query: string, accessToken: string, rules: NicheRules): Promise<Product[]> {
  const results = await searchCatalog(query, accessToken, SEARCH_LIMIT);
  const domain = dominantDomain(results);
  const candidates: Product[] = [];
  for (const catalogProduct of results) {
    if (domain && catalogProduct.domain_id !== domain) continue;
    const offer = pickOffer(await getProductOffers(catalogProduct.id, accessToken));
    if (!offer) continue;
    const product = mapToProduct(catalogProduct, offer);
    if (!checkNiche(product, rules).allowed) continue;
    candidates.push(product);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

// Peça parecida à venda no catálogo do ML. Com o modelo do carro, busca primeiro "peça + carro"
// e, sem nada à venda, só a peça. Com valor aproximado, fica com a de preço mais próximo
// (uma roda de ~R$ 12 mil não vira uma de R$ 200); sem valor, com a mais relevante.
async function searchPart(item: ProjectItem, accessToken: string, rules: NicheRules, car?: string): Promise<ProjectPart> {
  const queries = car ? [`${item.label} ${car}`, item.label] : [item.label];
  for (const query of queries) {
    const candidates = await candidatesFor(query, accessToken, rules);
    if (candidates.length === 0) continue;
    return {
      item,
      via: "busca",
      product: item.approxPrice === undefined ? candidates[0] : closestTo(candidates, item.approxPrice),
    };
  }
  return {
    item,
    via: "busca",
    problem: "nenhuma peça parecida à venda no catálogo; cole o link de um produto do ML junto com o preço",
  };
}

function isMercadoLivre(url: URL): boolean {
  return url.hostname.endsWith("mercadolivre.com.br") || url.hostname.endsWith("mercadolibre.com");
}

// "/MLB-4542401423-farol-saveiro-g6-mascara-negra-_JM" → "Farol Saveiro G6 Mascara Negra".
export function titleFromSlug(url: URL): string | undefined {
  const slug = url.pathname
    .split("/")
    .filter((segment) => /[a-z]{3}/i.test(segment) && !/^p$/i.test(segment))
    .sort((a, b) => b.length - a.length)[0];
  const words = slug
    ?.replace(/^MLB-?\d+-?/i, "")
    .replace(/-_JM.*$/i, "")
    .split("-")
    .filter(Boolean);
  if (!words || words.length === 0) return undefined;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// Produto escolhido à mão. Link de catálogo (/p/MLB...) tem preço e vendedor pela API; anúncio
// comum, não (a API de anúncios responde 403), então vale o preço que veio junto do link.
async function partFromLink(item: ProjectItem, accessToken: string, rules: NicheRules): Promise<ProjectPart> {
  let url: URL;
  try {
    url = new URL(item.url ?? "");
  } catch {
    return { item, via: "link", problem: "link inválido" };
  }
  if (url.hostname === "meli.la") {
    return { item, via: "link", problem: "link curto meli.la não serve: cole o endereço da página do produto" };
  }
  if (!isMercadoLivre(url)) {
    return { item, via: "link", problem: "por enquanto só links do Mercado Livre" };
  }

  const catalogId = /\/p\/(MLB\d+)/i.exec(url.pathname)?.[1]?.toUpperCase();
  let product: Product | undefined;
  if (catalogId) {
    const details = await getCatalogProduct(catalogId, accessToken);
    const offer = details ? pickOffer(await getProductOffers(catalogId, accessToken)) : undefined;
    if (details && offer) product = mapToProduct(details, offer);
  }
  if (!product) {
    if (item.approxPrice === undefined) {
      return { item, via: "link", problem: "informe o preço da página junto do link (ex: farol: 389 https://...)" };
    }
    product = {
      source: "mercadolivre",
      id: catalogId ?? /MLB-?(\d+)/i.exec(url.pathname)?.[0] ?? url.pathname,
      title: titleFromSlug(url) ?? item.label,
      price: item.approxPrice,
      currency: "BRL",
      url: `${url.origin}${url.pathname}`,
    };
  }

  const niche = checkNiche(product, rules);
  if (!niche.allowed) return { item, via: "link", problem: `barrado pelo filtro do nicho (${niche.reason})` };
  return { item, via: "link", product };
}

export async function findSimilarPart(
  item: ProjectItem,
  accessToken: string,
  rules: NicheRules,
  car?: string,
): Promise<ProjectPart> {
  return item.url ? partFromLink(item, accessToken, rules) : searchPart(item, accessToken, rules, car);
}
