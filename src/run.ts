import path from "node:path";
import { createPublishers, publishToAll } from "./channels/index.js";
import { loadSettings } from "./config/env.js";
import { shouldSkipAsDuplicate } from "./curation/dedupe.js";
import { isRealOffer } from "./curation/isRealOffer.js";
import { checkNiche, loadNicheRules } from "./curation/niche.js";
import { loadState, recordObservation, recordPosted, saveState } from "./curation/priceHistory.js";
import { logger } from "./logger.js";
import { createSources } from "./sources/index.js";
import { productKey } from "./sources/types.js";
import { loadTikTokKit, runKitStep } from "./tiktok/kit.js";
import { loadKitLog, recordOffer, saveKitLog } from "./tiktok/kitLog.js";

const STATE_PATH = path.join(process.cwd(), "data", "state.json");
const KIT_LOG_PATH = path.join(process.cwd(), "data", "tiktok-kit.json");
const NICHE_PATH = path.join(process.cwd(), "config", "niche.json");

function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export async function run(): Promise<void> {
  const settings = loadSettings();
  const nicheRules = await loadNicheRules(NICHE_PATH);
  const sources = createSources(settings.SOURCES);
  const publishers = createPublishers(settings.CHANNELS);
  const tiktokKit = await loadTikTokKit();
  if (!tiktokKit) {
    logger.info("Kit do TikTok desligado (TELEGRAM_KIT_CHAT_ID vazio)");
  }
  let state = await loadState(STATE_PATH);
  let kitLog = await loadKitLog(KIT_LOG_PATH);

  let candidates = 0;
  let posted = 0;
  let hadFailure = false;
  try {
    for (const source of sources) {
      // Uma fonte fora do ar não pode impedir as outras de publicar; o run só fica vermelho no fim.
      try {
        for await (const product of source.products()) {
          candidates += 1;
          const key = productKey(product);

          const nicheCheck = checkNiche(product, nicheRules);
          if (!nicheCheck.allowed) {
            logger.info("Fora do nicho, ignorando", { produto: key, reason: nicheCheck.reason });
            continue;
          }

          const previousPrice = state.items[key]?.minPrice;
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

          const affiliateUrl = await source.affiliateUrl(product);
          const discountPercent = offerCheck.discountPercent ?? 0;
          const failures = await publishToAll(publishers, { product, affiliateUrl, discountPercent });
          for (const failure of failures) {
            logger.error("Falha ao publicar", { produto: key, canal: failure.channel, error: String(failure.error) });
          }
          if (failures.length === publishers.length) {
            // Não saiu em canal nenhum: não marca como postada, pra tentar de novo no próximo run.
            throw new Error(`Nenhum canal conseguiu publicar ${key}`);
          }

          // Saiu em pelo menos um canal: marca como postada pra não repetir nos que funcionaram.
          state = recordPosted(state, key, product.price);
          kitLog = recordOffer(kitLog, {
            key,
            product,
            affiliateUrl,
            discountPercent,
            previousPrice,
            foundAt: new Date().toISOString(),
          });
          posted += 1;
          hadFailure ||= failures.length > 0;
          logger.info("Oferta postada", { produto: key, price: product.price });
        }
      } catch (error) {
        hadFailure = true;
        logger.error("Fonte falhou, seguindo com as outras", { fonte: source.id, error: describeError(error) });
      }
    }

    if (tiktokKit) {
      try {
        kitLog = await runKitStep(tiktokKit, kitLog);
      } catch (error) {
        // O horário não é marcado como atendido: o próximo run tenta de novo.
        hadFailure = true;
        logger.error("Kit do TikTok falhou", { error: describeError(error) });
      }
    }
  } finally {
    await saveState(STATE_PATH, state);
    await saveKitLog(KIT_LOG_PATH, kitLog);
  }

  logger.info("Execução concluída", { candidatos: candidates, postadas: posted });
  if (hadFailure) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  logger.error("Execução falhou", { error: describeError(error) });
  process.exitCode = 1;
});
