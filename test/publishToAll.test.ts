import { describe, expect, it } from "vitest";
import { publishToAll } from "../src/channels/index.js";
import type { ProductPost, Publisher } from "../src/channels/types.js";

const post: ProductPost = {
  product: {
    source: "mercadolivre",
    id: "MLB123",
    title: "Paleta de sombras",
    price: 49.9,
    currency: "BRL",
    url: "https://produto.mercadolivre.com.br/MLB123",
  },
  affiliateUrl: "https://x.com",
  discountPercent: 20,
};

function fakePublisher(outcome: "ok" | Error, published: ProductPost[]): Publisher {
  return {
    id: "telegram",
    async publishProduct(received) {
      if (outcome instanceof Error) throw outcome;
      published.push(received);
    },
  };
}

describe("publishToAll", () => {
  it("não retorna falhas quando todos os canais publicam", async () => {
    const published: ProductPost[] = [];
    const failures = await publishToAll([fakePublisher("ok", published), fakePublisher("ok", published)], post);
    expect(failures).toEqual([]);
    expect(published).toHaveLength(2);
  });

  it("segue publicando nos outros canais quando um falha", async () => {
    const published: ProductPost[] = [];
    const error = new Error("fora do ar");
    const failures = await publishToAll([fakePublisher(error, published), fakePublisher("ok", published)], post);
    expect(failures).toEqual([{ channel: "telegram", error }]);
    expect(published).toEqual([post]);
  });
});
