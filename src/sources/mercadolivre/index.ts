import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseEnv } from "../../config/env.js";
import { logger } from "../../logger.js";
import type { Source } from "../types.js";
import { buildAffiliateLink } from "./affiliateLink.js";
import { refreshAccessToken } from "./auth.js";
import { getItem, searchItemIds } from "./client.js";
import { mapToProduct } from "./mapToProduct.js";
import { readTokenFile, writeTokenFile } from "./tokenStore.js";

const TOKEN_PATH = path.join(process.cwd(), "data", "ml-token.enc");
const WATCHLIST_PATH = path.join(process.cwd(), "config", "watchlist.json");

const envSchema = z.object({
  ML_CLIENT_ID: z.string().min(1, "ML_CLIENT_ID é obrigatório"),
  ML_CLIENT_SECRET: z.string().min(1, "ML_CLIENT_SECRET é obrigatório"),
  ML_TOKEN_ENCRYPTION_KEY: z.string().min(1, "ML_TOKEN_ENCRYPTION_KEY é obrigatório"),
  ML_AFFILIATE_MATT_WORD: z.string().min(1, "ML_AFFILIATE_MATT_WORD é obrigatório"),
  ML_AFFILIATE_MATT_TOOL: z.string().min(1, "ML_AFFILIATE_MATT_TOOL é obrigatório"),
});

interface Watchlist {
  itemIds: string[];
  searchQueries?: string[];
}

async function loadWatchlist(): Promise<Watchlist> {
  const contents = await readFile(WATCHLIST_PATH, "utf8");
  return JSON.parse(contents) as Watchlist;
}

export function createMercadoLivreSource(): Source {
  const env = parseEnv(envSchema);

  return {
    id: "mercadolivre",

    async *products() {
      const watchlist = await loadWatchlist();

      const refreshToken = await readTokenFile(TOKEN_PATH, env.ML_TOKEN_ENCRYPTION_KEY);
      const tokenResponse = await refreshAccessToken(refreshToken, {
        clientId: env.ML_CLIENT_ID,
        clientSecret: env.ML_CLIENT_SECRET,
      });
      // Salva o refresh_token novo imediatamente: o ML invalida o antigo a cada troca,
      // então se o resto do run falhar depois daqui, o próximo run ainda precisa conseguir autenticar.
      await writeTokenFile(TOKEN_PATH, tokenResponse.refresh_token, env.ML_TOKEN_ENCRYPTION_KEY);

      const candidateIds = new Set(watchlist.itemIds);
      for (const query of watchlist.searchQueries ?? []) {
        try {
          const ids = await searchItemIds(query, tokenResponse.access_token);
          for (const id of ids) candidateIds.add(id);
        } catch (error) {
          logger.warn("Busca por palavra-chave falhou, seguindo só com a watchlist", {
            query,
            error: String(error),
          });
        }
      }

      for (const itemId of candidateIds) {
        const item = await getItem(itemId, tokenResponse.access_token);
        if (!item) continue;
        const product = mapToProduct(item);
        if (product) yield product;
      }
    },

    async affiliateUrl(product) {
      return buildAffiliateLink(product.url, env.ML_AFFILIATE_MATT_WORD, env.ML_AFFILIATE_MATT_TOOL);
    },
  };
}
