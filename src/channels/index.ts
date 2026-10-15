import { createTelegramPublisher } from "./telegram/index.js";
import type { ChannelId, ProductPost, Publisher } from "./types.js";

const factories: Record<ChannelId, () => Publisher> = {
  telegram: createTelegramPublisher,
};

export function createPublishers(ids: readonly ChannelId[]): Publisher[] {
  return ids.map((id) => factories[id]());
}

export interface PublishFailure {
  channel: ChannelId;
  error: unknown;
}

// Publica em todos os canais ao mesmo tempo, sem deixar a falha de um impedir os outros.
export async function publishToAll(publishers: readonly Publisher[], post: ProductPost): Promise<PublishFailure[]> {
  const results = await Promise.allSettled(publishers.map((publisher) => publisher.publishProduct(post)));
  return results.flatMap((result, index) =>
    result.status === "rejected" ? [{ channel: publishers[index].id, error: result.reason }] : [],
  );
}
