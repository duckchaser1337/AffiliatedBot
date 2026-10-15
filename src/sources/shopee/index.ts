import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseEnv } from "../../config/env.js";
import { logger } from "../../logger.js";
import type { Source } from "../types.js";
import { searchProductOffers, type ShopeeCredentials } from "./client.js";
import { mapToProduct } from "./mapToProduct.js";
import type { ShopeeOffer } from "./schemas.js";

const CONFIG_PATH = path.join(process.cwd(), "config", "shopee.json");

const envSchema = z.object({
  SHOPEE_APP_ID: z.string().min(1, "SHOPEE_APP_ID é obrigatório"),
  SHOPEE_APP_SECRET: z.string().min(1, "SHOPEE_APP_SECRET é obrigatório"),
});

const configSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  sortType: z.number().int().default(2),
  limit: z.number().int().min(1).max(50).default(20),
  minRating: z.number().min(0).max(5).default(0),
  minSales: z.number().int().min(0).default(0),
});

type ShopeeConfig = z.infer<typeof configSchema>;

export function loadShopeeCredentials(source: NodeJS.ProcessEnv = process.env): ShopeeCredentials {
  const env = parseEnv(envSchema, source);
  return { appId: env.SHOPEE_APP_ID, secret: env.SHOPEE_APP_SECRET };
}

async function loadConfig(configPath: string): Promise<ShopeeConfig> {
  const contents = await readFile(configPath, "utf8");
  return configSchema.parse(JSON.parse(contents));
}

// Com publicação automática, nota e volume de vendas seguram produto fraco antes de tudo.
function meetsQualityBar(offer: ShopeeOffer, config: ShopeeConfig): boolean {
  const rating = Number(offer.ratingStar ?? 0);
  return rating >= config.minRating && (offer.sales ?? 0) >= config.minSales;
}

export function createShopeeSource({ configPath = CONFIG_PATH }: { configPath?: string } = {}): Source {
  const credentials = loadShopeeCredentials();
  // A busca já devolve o link de afiliado; guarda aqui pra entregar só pros produtos aprovados na curadoria.
  const affiliateUrls = new Map<string, string>();

  return {
    id: "shopee",

    async *products() {
      const config = await loadConfig(configPath);
      const seen = new Set<string>();
      let failedSearches = 0;

      for (const keyword of config.keywords) {
        let offers: ShopeeOffer[];
        try {
          offers = await searchProductOffers(keyword, config, credentials);
        } catch (error) {
          failedSearches += 1;
          logger.warn("Busca na Shopee falhou, seguindo com as outras", { keyword, error: String(error) });
          // Credencial errada derruba todas as buscas: isso tem que aparecer como erro, não como "0 produtos".
          if (failedSearches === config.keywords.length) {
            throw new Error(`Todas as buscas na Shopee falharam (última: ${String(error)})`);
          }
          continue;
        }

        for (const offer of offers) {
          const id = String(offer.itemId);
          if (seen.has(id)) continue;
          seen.add(id);
          if (!meetsQualityBar(offer, config)) continue;
          const mapped = mapToProduct(offer);
          if (!mapped) continue;
          affiliateUrls.set(id, mapped.affiliateUrl);
          yield mapped.product;
        }
      }
    },

    async affiliateUrl(product) {
      const url = affiliateUrls.get(product.id);
      if (!url) {
        throw new Error(`Link de afiliado da Shopee não encontrado para ${product.id}`);
      }
      return url;
    },
  };
}
