import { logger } from "../../logger.js";
import { mlItemSchema, mlSearchResultSchema, type MlItem } from "./schemas.js";

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

export async function getItem(itemId: string, accessToken: string): Promise<MlItem | null> {
  const response = await fetchWithRetry(`${API_BASE}/items/${itemId}`, accessToken);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    logger.warn("Falha ao buscar item do Mercado Livre", { itemId, status: response.status });
    return null;
  }
  const json = await response.json();
  const result = mlItemSchema.safeParse(json);
  if (!result.success) {
    logger.warn("Item do Mercado Livre com formato inesperado, ignorando", {
      itemId,
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
}

export async function searchItemIds(query: string, accessToken: string): Promise<string[]> {
  const url = `${API_BASE}/sites/MLB/search?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url, accessToken);
  if (!response.ok) {
    throw new Error(`Busca do Mercado Livre falhou (${response.status})`);
  }
  const json = await response.json();
  const result = mlSearchResultSchema.parse(json);
  return result.results.map((item) => item.id);
}
