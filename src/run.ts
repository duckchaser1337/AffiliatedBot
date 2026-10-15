import path from "node:path";
import { createPublishers, publishToAll } from "./channels/index.js";
import { loadSettings } from "./config/env.js";
import { shouldSkipAsDuplicate } from "./curation/dedupe.js";
import { isRealOffer } from "./curation/isRealOffer.js";
import { loadState, recordObservation, recordPosted, saveState } from "./curation/priceHistory.js";
import { logger } from "./logger.js";
import { createSources } from "./sources/index.js";
import { productKey } from "./sources/types.js";

const STATE_PATH = path.join(process.cwd(), "data", "state.json");

export async function run(): Promise<void> {
  const settings = loadSettings();
  const sources = createSources(settings.SOURCES);
  const publishers = createPublishers(settings.CHANNELS);
  let state = await loadState(STATE_PATH);

  let candidates = 0;
  let posted = 0;
  let hadChannelFailure = false;
  try {
    for (const source of sources) {
      for await (const product of source.products()) {
        candidates += 1;
        const key = productKey(product);

        const offerCheck = isRealOffer(state.items[key], product.price, settings.DISCOUNT_THRESHOLD_PERCENT);
        state = recordObservation(state, key, product.price).state;

        if (!offerCheck.isReal) {
          logger.info("Oferta ignorada", { produto: key, reason: offerCheck.reason });
          continue;
        }

        if (shouldSkipAsDuplicate(state.posted[key], product.price, settings.DISCOUNT_THRESHOLD_PERCENT)) {
          logger.info("Oferta já postada recentemente, pulando", { produto: key });
          continue;
        }

        const failures = await publishToAll(publishers, {
          product,
          affiliateUrl: await source.affiliateUrl(product),
          discountPercent: offerCheck.discountPercent ?? 0,
        });
        for (const failure of failures) {
          logger.error("Falha ao publicar", { produto: key, canal: failure.channel, error: String(failure.error) });
        }
        if (failures.length === publishers.length) {
          // Não saiu em canal nenhum: não marca como postada, pra tentar de novo no próximo run.
          throw new Error(`Nenhum canal conseguiu publicar ${key}`);
        }

        // Saiu em pelo menos um canal: marca como postada pra não repetir nos que funcionaram.
        state = recordPosted(state, key, product.price);
        posted += 1;
        hadChannelFailure ||= failures.length > 0;
        logger.info("Oferta postada", { produto: key, price: product.price });
      }
    }
  } finally {
    await saveState(STATE_PATH, state);
  }

  logger.info("Execução concluída", { candidatos: candidates, postadas: posted });
  if (hadChannelFailure) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  logger.error("Execução falhou", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  process.exitCode = 1;
});
