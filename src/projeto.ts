import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sendTextMessage } from "./channels/telegram/client.js";
import { parseEnv } from "./config/env.js";
import { loadNicheRules } from "./curation/niche.js";
import { logger } from "./logger.js";
import { findSimilarPart, type ProjectPart } from "./projeto/findParts.js";
import { parseProjectItems } from "./projeto/items.js";
import {
  buildOverlayLines,
  buildPrivateReport,
  buildProjectCaption,
  buildProjectPost,
  type PricedPart,
} from "./projeto/messages.js";
import { buildAffiliateLink } from "./sources/mercadolivre/affiliateLink.js";
import { loadMlEnv, refreshMlAccessToken } from "./sources/mercadolivre/index.js";

// "Quanto custa esse projeto": a partir das peças que o dono do canal viu num vídeo de carro,
// acha peças parecidas à venda no ML, devolve os textos pro vídeo e a legenda no privado e,
// com PROJETO_PUBLICAR=true, posta o projeto com os links de afiliado no canal.
// Roda pelo workflow "projeto" (GitHub Actions), que salva o token do ML renovado.

const NICHE_PATH = path.join(process.cwd(), "config", "niche.json");
const CONFIG_PATH = path.join(process.cwd(), "config", "projeto.json");

const configSchema = z.object({
  cta: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
});

const envSchema = z.object({
  PROJETO_ITENS: z.string().min(1, "PROJETO_ITENS é obrigatório (ex: farol: 2500; roda aro 17: 12k)"),
  PROJETO_TITULO: z.string().optional(),
  // Modelo do carro do vídeo (ex: "saveiro g6"): entra na busca de cada peça.
  PROJETO_CARRO: z.string().optional(),
  PROJETO_PUBLICAR: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN é obrigatório"),
  TELEGRAM_CHANNEL_ID: z.string().min(1, "TELEGRAM_CHANNEL_ID é obrigatório"),
  TELEGRAM_KIT_CHAT_ID: z.string().min(1, "TELEGRAM_KIT_CHAT_ID é obrigatório (seu chat privado com o bot)"),
});

async function main(): Promise<void> {
  const env = parseEnv(envSchema);
  const items = parseProjectItems(env.PROJETO_ITENS);
  if (items.length === 0) {
    throw new Error("Nenhuma peça em PROJETO_ITENS (ex: farol: 2500; roda aro 17: 12k)");
  }
  const title = env.PROJETO_TITULO?.trim() || undefined;
  const car = env.PROJETO_CARRO?.trim() || undefined;
  const publish = env.PROJETO_PUBLICAR === "true";
  const config = configSchema.parse(JSON.parse(await readFile(CONFIG_PATH, "utf8")));
  const rules = await loadNicheRules(NICHE_PATH);
  const mlEnv = loadMlEnv();
  const accessToken = await refreshMlAccessToken(mlEnv);

  const parts: ProjectPart[] = [];
  for (const item of items) {
    parts.push(await findSimilarPart(item, accessToken, rules, car));
  }
  const priced: PricedPart[] = parts.flatMap((part) =>
    part.product
      ? [
          {
            label: part.item.label,
            title: part.product.title,
            price: part.product.price,
            affiliateUrl: buildAffiliateLink(part.product.url, mlEnv.ML_AFFILIATE_MATT_WORD, mlEnv.ML_AFFILIATE_MATT_TOOL),
          },
        ]
      : [],
  );
  if (priced.length === 0) {
    throw new Error("Nenhuma peça parecida à venda: tente nomes mais específicos (ex: \"roda aro 17\")");
  }

  const overlayLines = buildOverlayLines(priced);
  const caption = buildProjectCaption(title, config.cta, config.hashtags);
  const telegram = { botToken: env.TELEGRAM_BOT_TOKEN };
  if (publish) {
    await sendTextMessage({ ...telegram, chatId: env.TELEGRAM_CHANNEL_ID, text: buildProjectPost(title, priced), html: true });
  }
  const report = buildPrivateReport({ title, parts, overlayLines, caption, published: publish });
  await sendTextMessage({ ...telegram, chatId: env.TELEGRAM_KIT_CHAT_ID, text: report });

  logger.info("Projeto montado", { pecas: items.length, encontradas: priced.length, publicado: publish });
  console.log(report);
}

main().catch((error) => {
  logger.error("Projeto falhou", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  process.exitCode = 1;
});
