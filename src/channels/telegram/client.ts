import { z } from "zod";
import { logger } from "../../logger.js";

const API_BASE = "https://api.telegram.org";

const telegramErrorSchema = z.object({
  parameters: z.object({ retry_after: z.number() }).optional(),
});

interface SendMessageParams {
  botToken: string;
  chatId: string;
  text: string;
  photoUrl?: string;
}

async function post(botToken: string, method: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    const json = await response.json().catch(() => null);
    const parsed = telegramErrorSchema.safeParse(json);
    const retryAfter = (parsed.success ? parsed.data.parameters?.retry_after : undefined) ?? 5;
    logger.warn("Telegram pediu para esperar (429)", { retryAfter });
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return post(botToken, method, body);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram ${method} falhou (${response.status}): ${errorBody}`);
  }
}

export async function sendOfferMessage({ botToken, chatId, text, photoUrl }: SendMessageParams): Promise<void> {
  if (photoUrl) {
    try {
      await post(botToken, "sendPhoto", {
        chat_id: chatId,
        photo: photoUrl,
        caption: text,
        parse_mode: "HTML",
      });
      return;
    } catch (error) {
      logger.warn("Falha ao enviar com foto, tentando texto simples", { error: String(error) });
    }
  }
  await post(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}
