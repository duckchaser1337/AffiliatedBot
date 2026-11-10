import { checkNiche, normalize, type NicheRules } from "../curation/niche.js";
import { getCatalogProduct, getProductOffers, predictDomain, searchCatalog } from "../sources/mercadolivre/client.js";
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

// Tipo de produto da peça. Vale a previsão do ML pra peça quando ela aparece na busca da peça
// ("insulfilm" → película automotiva, mesmo com a busca cheia de película residencial). Senão, a
// previsão pra "peça + carro" ("kit rebaixamento" sozinho ele prevê como refilador de bordas; com
// "saveiro g6", como kit de suspensão). Sem carro, o tipo mais comum na busca.
async function partDomain(
  label: string,
  car: string | undefined,
  labelResults: readonly MlCatalogProduct[],
  accessToken: string,
): Promise<string | undefined> {
  const predicted = await predictDomain(label, accessToken);
  if (predicted && labelResults.some((result) => result.domain_id === predicted)) return predicted;
  const predictedWithCar = car ? await predictDomain(`${label} ${car}`, accessToken) : undefined;
  return predictedWithCar ?? dominantDomain(labelResults);
}

function closestTo(candidates: Product[], target: number): Product {
  return candidates.reduce((best, product) =>
    Math.abs(product.price - target) < Math.abs(best.price - target) ? product : best,
  );
}

// "205/55 R16" → ["205", "55", "16"]; "G05" e "g5" viram o mesmo "5".
function numbersIn(text: string): string[] {
  return (text.match(/\d+/g) ?? []).map((digits) => String(Number(digits)));
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

interface PartFilter {
  domain?: string;
  // Medidas da peça pedida (aro, largura do pneu...): têm que estar no nome do produto.
  measures: string[];
  // Palavras do modelo do carro; o produto tem que citar pelo menos uma.
  carWords: string[];
}

function matchesFilter(catalogProduct: MlCatalogProduct, filter: PartFilter): boolean {
  if (filter.domain && catalogProduct.domain_id !== filter.domain) return false;
  const nameNumbers = new Set(numbersIn(catalogProduct.name));
  if (!filter.measures.every((measure) => nameNumbers.has(measure))) return false;
  if (filter.carWords.length === 0) return true;
  const nameWords = new Set(words(catalogProduct.name));
  return filter.carWords.some((word) => nameWords.has(word));
}

async function candidatesFrom(
  results: readonly MlCatalogProduct[],
  filter: PartFilter,
  accessToken: string,
  rules: NicheRules,
): Promise<Product[]> {
  const candidates: Product[] = [];
  for (const catalogProduct of results) {
    if (!matchesFilter(catalogProduct, filter)) continue;
    const offer = pickOffer(await getProductOffers(catalogProduct.id, accessToken));
    if (!offer) continue;
    const product = mapToProduct(catalogProduct, offer);
    if (!checkNiche(product, rules).allowed) continue;
    candidates.push(product);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

// Peça parecida à venda no catálogo do ML: do tipo de produto da peça e com as medidas que vieram
// no nome (roda aro 17 não vira aro 18). Com o modelo do carro, prefere o que aparece na busca
// "peça + carro" e cita o carro; sem nada à venda assim, fica com a busca só da peça. Com valor
// aproximado, fica com a de preço mais próximo (uma roda de ~R$ 12 mil não vira uma de R$ 200);
// sem valor, com a mais relevante.
async function searchPart(item: ProjectItem, accessToken: string, rules: NicheRules, car?: string): Promise<ProjectPart> {
  const labelResults = await searchCatalog(item.label, accessToken, SEARCH_LIMIT);
  const domain = await partDomain(item.label, car, labelResults, accessToken);
  const measures = numbersIn(item.label);
  // "Saveiro G6" → ["saveiro"]: código curto e ano ficam de fora, só o nome do modelo identifica.
  const carWords = car ? words(car).filter((word) => word.length >= 3 && /[a-z]/.test(word)) : [];

  const passes: { results: () => Promise<readonly MlCatalogProduct[]>; carWords: string[] }[] = [
    ...(car ? [{ results: () => searchCatalog(`${item.label} ${car}`, accessToken, SEARCH_LIMIT), carWords }] : []),
    { results: async () => labelResults, carWords: [] },
  ];
  for (const pass of passes) {
    const filter = { domain, measures, carWords: pass.carWords };
    const candidates = await candidatesFrom(await pass.results(), filter, accessToken, rules);
    if (candidates.length === 0) continue;
    return {
      item,
      via: "busca",
      product: item.approxPrice === undefined ? candidates[0] : closestTo(candidates, item.approxPrice),
    };
  }
  const measureNote = measures.length > 0 ? ` com a medida pedida (${measures.join(", ")})` : "";
  return {
    item,
    via: "busca",
    problem: `nenhuma peça parecida à venda no catálogo${measureNote}; cole o link de um produto do ML junto com o preço`,
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
