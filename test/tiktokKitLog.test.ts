import { describe, expect, it } from "vitest";
import { emptyKitLog, markKitSent, pickOfferForKit, recordOffer, type KitOffer } from "../src/tiktok/kitLog.js";

const now = new Date("2026-10-19T12:00:00Z");

function offer(key: string, discountPercent: number, foundAt: string): Omit<KitOffer, "kitAt"> {
  return {
    key,
    product: {
      source: "shopee",
      id: key,
      title: `Produto ${key}`,
      price: 50,
      currency: "BRL",
      url: `https://shopee.com.br/${key}`,
    },
    affiliateUrl: `https://s.shopee.com.br/${key}`,
    discountPercent,
    foundAt,
  };
}

describe("kit log", () => {
  it("escolhe a maior queda dentro da janela", () => {
    let log = emptyKitLog();
    log = recordOffer(log, offer("a", 18, "2026-10-19T08:00:00Z"), now);
    log = recordOffer(log, offer("b", 30, "2026-10-18T20:00:00Z"), now);
    log = recordOffer(log, offer("velho", 60, "2026-10-16T08:00:00Z"), now);

    expect(pickOfferForKit(log, now, 48)?.key).toBe("b");
  });

  it("não repete produto que já virou vídeo, mesmo se for gravado de novo", () => {
    let log = recordOffer(emptyKitLog(), offer("a", 30, "2026-10-19T08:00:00Z"), now);
    log = markKitSent(log, "a", "2026-10-19 09:00", now);
    log = recordOffer(log, offer("a", 40, "2026-10-19T11:00:00Z"), now);

    expect(log.offers.a.kitAt).toBe(now.toISOString());
    expect(pickOfferForKit(log, now, 48)).toBeUndefined();
    expect(log.servedSlots).toEqual(["2026-10-19 09:00"]);
  });

  it("descarta ofertas com mais de 7 dias ao gravar", () => {
    let log = recordOffer(emptyKitLog(), offer("antigo", 30, "2026-10-01T08:00:00Z"), now);
    log = recordOffer(log, offer("novo", 10, "2026-10-19T08:00:00Z"), now);

    expect(Object.keys(log.offers)).toEqual(["novo"]);
  });
});
