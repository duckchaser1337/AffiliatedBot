import type { z } from "zod";
import { logger } from "../../logger.js";
import {
  mlCatalogProductSchema,
  mlDomainDiscoverySchema,
  mlHighlightsSchema,
  mlOfferSchema,
  mlResultsSchema,
  type MlCatalogProduct,
  type MlOffer,
} from "./schemas.js";

const API_BASE = "https://api.mercadolibre.com";
const MAX_RETRIES = 3;

async function fetchWithRetry(url: string, accessToken: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Resposta ${response.status} do Mercado Livre`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const delayMs = 500 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseEach<T>(records: unknown[], schema: z.ZodType<T>, context: Record<string, unknown>): T[] {
  return records.flatMap((record) => {
    const result = schema.safeParse(record);
    if (result.success) return [result.data];
    logger.warn("Registro do Mercado Livre com formato inesperado, ignorando", {
      ...context,
      issues: result.error.issues,
    });
    return [];
  });
}

// Busca por palavra-chave no catálogo. Muitos resultados não têm vendedor ativo;
// quem decide isso é getProductOffers.
export async function searchCatalog(query: string, accessToken: string, limit: number): Promise<MlCatalogProduct[]> {
  const url = `${API_BASE}/products/search?status=active&site_id=MLB&q=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await fetchWithRetry(url, accessToken);
  if (!response.ok) {
    throw new Error(`Busca no catálogo do Mercado Livre falhou (${response.status})`);
  }
  const { results } = mlResultsSchema.parse(await response.json());
  return parseEach(results, mlCatalogProductSchema, { query });
}

// Tipo de produto que o próprio ML prevê pra busca (ex: "insulfilm" → MLB-VEHICLE_TINTED_GLASSES,
// mesmo com a busca cheia de película residencial). Sem previsão, quem chama decide outro jeito.
export async function predictDomain(query: string, accessToken: string): Promise<string | undefined> {
  const url = `${API_BASE}/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchWithRetry(url, accessToken);
    if (!response.ok) {
      logger.warn("Previsão de tipo de produto do Mercado Livre falhou", { query, status: response.status });
      return undefined;
    }
    const result = mlDomainDiscoverySchema.safeParse(await response.json());
    return result.success ? result.data[0]?.domain_id : undefined;
  } catch (error) {
    logger.warn("Previsão de tipo de produto do Mercado Livre falhou", { query, error: String(error) });
    return undefined;
  }
}

// Mais vendidos de uma categoria. Só os do tipo PRODUCT são de catálogo; ITEM e USER_PRODUCT
// apontam pra APIs que respondem 403.
export async function getBestSellerProductIds(categoryId: string, accessToken: string): Promise<string[]> {
  const response = await fetchWithRetry(`${API_BASE}/highlights/MLB/category/${categoryId}`, accessToken);
  if (!response.ok) {
    throw new Error(`Mais vendidos da categoria ${categoryId} falharam (${response.status})`);
  }
  const { content } = mlHighlightsSchema.parse(await response.json());
  return content.filter((entry) => entry.type === "PRODUCT").map((entry) => entry.id);
}

export async function getCatalogProduct(productId: string, accessToken: string): Promise<MlCatalogProduct | null> {
  const response = await fetchWithRetry(`${API_BASE}/products/${productId}`, accessToken);
  if (!response.ok) {
    logger.warn("Falha ao buscar produto do catálogo do Mercado Livre", { productId, status: response.status });
    return null;
  }
  const result = mlCatalogProductSchema.safeParse(await response.json());
  if (!result.success) {
    logger.warn("Produto do Mercado Livre com formato inesperado, ignorando", { productId, issues: result.error.issues });
    return null;
  }
  return result.data;
}

// Ofertas ativas de um produto. 404 ("No winners found") = ninguém vendendo agora.
export async function getProductOffers(productId: string, accessToken: string, limit = 10): Promise<MlOffer[]> {
  const response = await fetchWithRetry(`${API_BASE}/products/${productId}/items?limit=${limit}`, accessToken);
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    logger.warn("Falha ao buscar ofertas do produto do Mercado Livre", { productId, status: response.status });
    return [];
  }
  const { results } = mlResultsSchema.parse(await response.json());
  return parseEach(results, mlOfferSchema, { productId });
}
