import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseEnv } from "../../config/env.js";
import { logger } from "../../logger.js";
import type { Source } from "../types.js";
import { buildAffiliateLink } from "./affiliateLink.js";
import { refreshAccessToken } from "./auth.js";
import { getBestSellerProductIds, getCatalogProduct, getProductOffers, searchCatalog } from "./client.js";
import { mapToProduct, pickOffer } from "./mapToProduct.js";
import type { MlCatalogProduct } from "./schemas.js";
import { readTokenFile, writeTokenFile } from "./tokenStore.js";

export const ML_TOKEN_PATH = path.join(process.cwd(), "data", "ml-token.enc");
const WATCHLIST_PATH = path.join(process.cwd(), "config", "watchlist.json");

const mlEnvSchema = z.object({
  ML_CLIENT_ID: z.string().min(1, "ML_CLIENT_ID é obrigatório"),
  ML_CLIENT_SECRET: z.string().min(1, "ML_CLIENT_SECRET é obrigatório"),
  ML_TOKEN_ENCRYPTION_KEY: z.string().min(1, "ML_TOKEN_ENCRYPTION_KEY é obrigatório"),
  ML_AFFILIATE_MATT_WORD: z.string().min(1, "ML_AFFILIATE_MATT_WORD é obrigatório"),
  ML_AFFILIATE_MATT_TOOL: z.string().min(1, "ML_AFFILIATE_MATT_TOOL é obrigatório"),
});

const watchlistSchema = z.object({
  // IDs de produto de catálogo: o MLB... que vem depois de /p/ no endereço do produto.
  productIds: z.array(z.string().min(1)).default([]),
  searchQueries: z.array(z.string().min(1)).default([]),
  // Categorias cujos mais vendidos entram como candidatos.
  highlightCategories: z.array(z.string().min(1)).default([]),
  searchLimit: z.number().int().min(1).max(50).default(10),
});

type Watchlist = z.infer<typeof watchlistSchema>;

export type MlEnv = z.infer<typeof mlEnvSchema>;

export function loadMlEnv(source: NodeJS.ProcessEnv = process.env): MlEnv {
  return parseEnv(mlEnvSchema, source);
}

// Troca o refresh_token por um access_token e salva o refresh novo imediatamente: o ML invalida
// o antigo a cada troca, então se o resto do run falhar depois daqui, o próximo ainda autentica.
export async function refreshMlAccessToken(env: MlEnv, tokenPath: string = ML_TOKEN_PATH): Promise<string> {
  const refreshToken = await readTokenFile(tokenPath, env.ML_TOKEN_ENCRYPTION_KEY);
  const tokenResponse = await refreshAccessToken(refreshToken, {
    clientId: env.ML_CLIENT_ID,
    clientSecret: env.ML_CLIENT_SECRET,
  });
  await writeTokenFile(tokenPath, tokenResponse.refresh_token, env.ML_TOKEN_ENCRYPTION_KEY);
  return tokenResponse.access_token;
}

async function loadWatchlist(watchlistPath: string): Promise<Watchlist> {
  const contents = await readFile(watchlistPath, "utf8");
  return watchlistSchema.parse(JSON.parse(contents));
}

export function createMercadoLivreSource({
  tokenPath = ML_TOKEN_PATH,
  watchlistPath = WATCHLIST_PATH,
}: { tokenPath?: string; watchlistPath?: string } = {}): Source {
  const env = loadMlEnv();

  return {
    id: "mercadolivre",

    async *products() {
      const watchlist = await loadWatchlist(watchlistPath);

      const accessToken = await refreshMlAccessToken(env, tokenPath);

      // id → detalhes, quando a busca já trouxe; os demais são buscados um a um depois.
      const candidates = new Map<string, MlCatalogProduct | undefined>(
        watchlist.productIds.map((id) => [id, undefined]),
      );

      const discoveries = [
        ...watchlist.highlightCategories.map((category) => ({
          label: { categoria: category },
          run: async () => {
            for (const id of await getBestSellerProductIds(category, accessToken)) {
              if (!candidates.has(id)) candidates.set(id, undefined);
            }
          },
        })),
        ...watchlist.searchQueries.map((query) => ({
          label: { query },
          run: async () => {
            for (const product of await searchCatalog(query, accessToken, watchlist.searchLimit)) {
              candidates.set(product.id, product);
            }
          },
        })),
      ];

      let failedDiscoveries = 0;
      for (const discovery of discoveries) {
        try {
          await discovery.run();
        } catch (error) {
          failedDiscoveries += 1;
          logger.warn("Busca no Mercado Livre falhou, seguindo com as outras", {
            ...discovery.label,
            error: String(error),
          });
        }
      }
      // Token ou app com problema derruba todas as buscas: isso tem que aparecer como erro, não como "0 produtos".
      if (discoveries.length > 0 && failedDiscoveries === discoveries.length && watchlist.productIds.length === 0) {
        throw new Error("Todas as buscas no Mercado Livre falharam");
      }

      let withoutOffers = 0;
      for (const [id, known] of candidates) {
        const details = known ?? (await getCatalogProduct(id, accessToken));
        if (!details) continue;
        const offer = pickOffer(await getProductOffers(id, accessToken));
        if (!offer) {
          withoutOffers += 1;
          continue;
        }
        yield mapToProduct(details, offer);
      }
      logger.info("Mercado Livre: candidatos do catálogo", { total: candidates.size, semVendedorAtivo: withoutOffers });
    },

    async affiliateUrl(product) {
      return buildAffiliateLink(product.url, env.ML_AFFILIATE_MATT_WORD, env.ML_AFFILIATE_MATT_TOOL);
    },
  };
}
