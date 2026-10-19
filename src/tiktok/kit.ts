import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sendTextMessage, sendVideoFile } from "../channels/telegram/client.js";
import { parseEnv } from "../config/env.js";
import { logger } from "../logger.js";
import { buildKitInstructions, buildTikTokCaption } from "./caption.js";
import { markKitSent, pickOfferForKit, type KitLog } from "./kitLog.js";
import { FRAME_HEIGHT, FRAME_WIDTH, loadProductImage, renderKitFrames } from "./render/frames.js";
import { framesToVideo } from "./render/video.js";
import { currentSlot } from "./schedule.js";

const CONFIG_PATH = path.join(process.cwd(), "config", "tiktok.json");

const configSchema = z.object({
  slots: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário no formato HH:MM")).min(1),
  timeZone: z.string().default("America/Sao_Paulo"),
  lookbackHours: z.number().positive().default(48),
  hashtags: z.array(z.string()).default([]),
});

export type TikTokKitConfig = z.infer<typeof configSchema>;

const envSchema = z.object({
  TELEGRAM_KIT_CHAT_ID: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
});

export interface TikTokKit {
  botToken: string;
  chatId: string;
  config: TikTokKitConfig;
}

// O kit liga quando TELEGRAM_KIT_CHAT_ID está preenchido (seu chat privado com o bot).
export async function loadTikTokKit(
  source: NodeJS.ProcessEnv = process.env,
  configPath: string = CONFIG_PATH,
): Promise<TikTokKit | undefined> {
  const env = parseEnv(envSchema, source);
  const chatId = env.TELEGRAM_KIT_CHAT_ID?.trim();
  if (!chatId) return undefined;
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Configuração inválida:\nTELEGRAM_BOT_TOKEN: obrigatório para o kit do TikTok");
  }
  const config = configSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  return { botToken: env.TELEGRAM_BOT_TOKEN, chatId, config };
}

// Um vídeo por horário: pega o melhor achado ainda não usado, monta e manda no Telegram privado.
export async function runKitStep(kit: TikTokKit, log: KitLog, now: Date = new Date()): Promise<KitLog> {
  const slot = currentSlot(now, kit.config.slots, kit.config.timeZone);
  if (!slot || log.servedSlots.includes(slot)) return log;

  const offer = pickOfferForKit(log, now, kit.config.lookbackHours);
  if (!offer) {
    // Não marca o horário: se aparecer achado antes do próximo, ele ainda vira vídeo.
    logger.info("Kit do TikTok: nenhum achado novo para este horário", { horario: slot });
    return log;
  }

  const photo = offer.product.imageUrl ? await loadProductImage(offer.product.imageUrl) : undefined;
  const frames = await renderKitFrames(offer, photo);
  const video = await framesToVideo(frames, { width: FRAME_WIDTH, height: FRAME_HEIGHT });

  await sendVideoFile({
    botToken: kit.botToken,
    chatId: kit.chatId,
    video,
    fileName: `achado-${slot.replace(/\D/g, "")}.mp4`,
    caption: buildTikTokCaption(offer, kit.config.hashtags),
  });
  await sendTextMessage({ botToken: kit.botToken, chatId: kit.chatId, text: buildKitInstructions(offer, slot) });

  logger.info("Kit do TikTok enviado", { horario: slot, produto: offer.key });
  return markKitSent(log, offer.key, slot, now);
}
