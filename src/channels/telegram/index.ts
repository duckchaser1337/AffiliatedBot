import { z } from "zod";
import { parseEnv } from "../../config/env.js";
import type { Publisher } from "../types.js";
import { sendOfferMessage } from "./client.js";
import { formatOfferMessage } from "./formatMessage.js";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN é obrigatório"),
  TELEGRAM_CHANNEL_ID: z.string().min(1, "TELEGRAM_CHANNEL_ID é obrigatório"),
});

export function createTelegramPublisher(): Publisher {
  const env = parseEnv(envSchema);

  return {
    id: "telegram",

    async publishProduct(post) {
      await sendOfferMessage({
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHANNEL_ID,
        text: formatOfferMessage(post),
        photoUrl: post.product.imageUrl,
      });
    },
  };
}
