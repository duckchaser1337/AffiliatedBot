import { afterEach, describe, expect, it, vi } from "vitest";
import { runKitStep, type TikTokKit } from "../src/tiktok/kit.js";
import {
  emptyKitLog,
  markKitSent,
  pickFallbackForKit,
  recordOffer,
  recordSeen,
  type KitLog,
  type KitOffer,
} from "../src/tiktok/kitLog.js";
import type { Product } from "../src/sources/types.js";

// 09:07 em São Paulo.
const now = new Date("2026-10-19T12:07:00Z");

function product(id: string, extra: Partial<Product> = {}): Product {
  return {
    source: "mercadolivre",
    id,
    title: `Produto ${id}`,
    price: 49.9,
    currency: "BRL",
    url: `https://www.mercadolivre.com.br/p/${id}`,
    ...extra,
  };
}

function seen(log: KitLog, id: string, seenAt: string, extra: Partial<Product> = {}): KitLog {
  return recordSeen(
    log,
    { key: `mercadolivre:${id}`, product: product(id, extra), affiliateUrl: `https://afiliado/${id}`, seenAt },
    now,
  );
}

describe("reserva do Achado do dia", () => {
  it("prefere mais vendido, depois loja oficial, depois com foto", () => {
    let log = emptyKitLog();
    log = seen(log, "comFoto", "2026-10-19T11:00:00Z", { imageUrl: "https://img/1.jpg" });
    log = seen(log, "oficial", "2026-10-19T10:00:00Z", { officialStore: true });
    log = seen(log, "maisVendido", "2026-10-19T09:00:00Z", { bestSeller: true });

    expect(pickFallbackForKit(log, now, 48)?.product.id).toBe("maisVendido");
  });

  it("não reaproveita produto usado no último mês, nem visto fora da janela", () => {
    let log = seen(emptyKitLog(), "usado", "2026-10-19T11:00:00Z", { bestSeller: true });
    log = markKitSent(log, "mercadolivre:usado", "2026-10-18 19:00", new Date("2026-10-18T22:07:00Z"));
    log = seen(log, "usado", "2026-10-19T11:30:00Z", { bestSeller: true });
    log = seen(log, "antigo", "2026-10-15T11:00:00Z");

    expect(log.pool["mercadolivre:usado"].kitAt).toBe("2026-10-18T22:07:00.000Z");
    expect(pickFallbackForKit(log, now, 48)).toBeUndefined();
  });

  it("não usa como achado do dia o que já virou vídeo de queda de preço", () => {
    const offer: Omit<KitOffer, "kitAt"> = {
      key: "mercadolivre:a",
      product: product("a"),
      affiliateUrl: "https://afiliado/a",
      discountPercent: 20,
      foundAt: "2026-10-19T08:00:00Z",
    };
    let log = recordOffer(emptyKitLog(), offer, now);
    log = markKitSent(log, "mercadolivre:a", "2026-10-19 09:00", now);
    log = seen(log, "a", "2026-10-19T11:00:00Z");

    expect(pickFallbackForKit(log, now, 48)).toBeUndefined();
  });
});

describe("runKitStep sem queda de preço", () => {
  const kit: TikTokKit = {
    botToken: "123:abc",
    chatId: "999",
    config: { slots: ["09:00"], timeZone: "America/Sao_Paulo", lookbackHours: 48, hashtags: [] },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publica o achado do dia no canal, manda o kit e marca horário e produto", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const published: KitOffer[] = [];

    const log = await runKitStep(kit, seen(emptyKitLog(), "b", "2026-10-19T11:00:00Z", { bestSeller: true }), now, {
      publishFallback: async (offer) => {
        published.push(offer);
      },
    });

    expect(published.map((offer) => [offer.key, offer.discountPercent])).toEqual([["mercadolivre:b", 0]]);
    expect(fetchMock.mock.calls.map(([url]) => url.split("/").at(-1))).toEqual(["sendVideo", "sendMessage"]);
    expect(log.servedSlots).toEqual(["2026-10-19 09:00"]);
    expect(log.pool["mercadolivre:b"].kitAt).toBe(now.toISOString());
  }, 60_000);

  it("se não conseguir postar no canal, não manda o kit e o horário fica aberto", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const step = runKitStep(kit, seen(emptyKitLog(), "b", "2026-10-19T11:00:00Z"), now, {
      publishFallback: async () => {
        throw new Error("Telegram fora do ar");
      },
    });

    await expect(step).rejects.toThrow(/Telegram fora do ar/);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);
});
