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

// init é uma função porque, depois de um 429, a requisição é refeita do zero.
async function request(botToken: string, method: string, init: () => RequestInit): Promise<void> {
  const response = await fetch(`${API_BASE}/bot${botToken}/${method}`, init());

  if (response.status === 429) {
    const json = await response.json().catch(() => null);
    const parsed = telegramErrorSchema.safeParse(json);
    const retryAfter = (parsed.success ? parsed.data.parameters?.retry_after : undefined) ?? 5;
    logger.warn("Telegram pediu para esperar (429)", { retryAfter });
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return request(botToken, method, init);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram ${method} falhou (${response.status}): ${errorBody}`);
  }
}

function post(botToken: string, method: string, body: Record<string, unknown>): Promise<void> {
  return request(botToken, method, () => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
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

export async function sendTextMessage({ botToken, chatId, text }: Omit<SendMessageParams, "photoUrl">): Promise<void> {
  await post(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  });
}

interface SendVideoParams {
  botToken: string;
  chatId: string;
  video: Buffer;
  fileName: string;
  caption: string;
}

export async function sendVideoFile({ botToken, chatId, video, fileName, caption }: SendVideoParams): Promise<void> {
  await request(botToken, "sendVideo", () => {
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("caption", caption);
    form.set("supports_streaming", "true");
    form.set("video", new Blob([new Uint8Array(video)], { type: "video/mp4" }), fileName);
    return { method: "POST", body: form };
  });
}
