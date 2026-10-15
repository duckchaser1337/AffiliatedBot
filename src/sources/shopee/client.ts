import { createHash } from "node:crypto";
import { logger } from "../../logger.js";
import { shopeeOfferSchema, shopeeResponseSchema, type ShopeeOffer } from "./schemas.js";

export const API_URL = "https://open-api.affiliate.shopee.com.br/graphql";
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_CODE = 10030;

export interface ShopeeCredentials {
  appId: string;
  secret: string;
}

export interface SearchOptions {
  sortType: number;
  limit: number;
}

export class ShopeeApiError extends Error {
  constructor(
    readonly code: number | undefined,
    message: string,
    readonly retryable = false,
  ) {
    super(code === undefined ? message : `Shopee ${code}: ${message}`);
    this.name = "ShopeeApiError";
  }
}

// A assinatura cobre os bytes exatos do corpo, então o corpo é montado uma vez e enviado igual.
export function buildAuthHeader(appId: string, secret: string, body: string, timestamp: number): string {
  const signature = createHash("sha256").update(`${appId}${timestamp}${body}${secret}`).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

function buildQuery(keyword: string, { sortType, limit }: SearchOptions): string {
  // JSON.stringify gera um literal de string válido em GraphQL, com aspas e acentos escapados.
  return (
    `{ productOfferV2(keyword: ${JSON.stringify(keyword)}, sortType: ${sortType}, page: 1, limit: ${limit}) ` +
    "{ nodes { itemId productName priceMin ratingStar sales imageUrl shopType productLink offerLink } } }"
  );
}

async function requestOnce(body: string, credentials: ShopeeCredentials): Promise<unknown[]> {
  // Timestamp novo a cada tentativa: a Shopee recusa assinatura antiga.
  const timestamp = Math.floor(Date.now() / 1000);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(credentials.appId, credentials.secret, body, timestamp),
    },
    body,
  });

  if (response.status === 429 || response.status >= 500) {
    throw new ShopeeApiError(undefined, `resposta ${response.status} da Shopee`, true);
  }
  if (!response.ok) {
    throw new ShopeeApiError(undefined, `resposta ${response.status} da Shopee: ${await response.text()}`);
  }

  const parsed = shopeeResponseSchema.parse(await response.json());
  const error = parsed.errors?.[0];
  if (error) {
    const code = error.extensions?.code;
    const message = error.extensions?.message ?? error.message ?? "erro sem mensagem";
    throw new ShopeeApiError(code, message, code === RATE_LIMIT_CODE);
  }
  return parsed.data?.productOfferV2?.nodes ?? [];
}

function isRetryable(error: unknown): boolean {
  // TypeError é falha de rede do fetch; o resto (assinatura, acesso negado) não melhora tentando de novo.
  return (error instanceof ShopeeApiError && error.retryable) || error instanceof TypeError;
}

function parseOffers(nodes: unknown[], keyword: string): ShopeeOffer[] {
  return nodes.flatMap((node) => {
    const result = shopeeOfferSchema.safeParse(node);
    if (result.success) return [result.data];
    logger.warn("Oferta da Shopee com formato inesperado, ignorando", { keyword, issues: result.error.issues });
    return [];
  });
}

export async function searchProductOffers(
  keyword: string,
  options: SearchOptions,
  credentials: ShopeeCredentials,
  retryDelayMs = 1000,
): Promise<ShopeeOffer[]> {
  const body = JSON.stringify({ query: buildQuery(keyword, options) });
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return parseOffers(await requestOnce(body, credentials), keyword);
    } catch (error) {
      if (!isRetryable(error)) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}
