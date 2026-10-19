import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTikTokKit, runKitStep, type TikTokKit } from "../src/tiktok/kit.js";
import { emptyKitLog, recordOffer } from "../src/tiktok/kitLog.js";

const kit: TikTokKit = {
  botToken: "123:abc",
  chatId: "999",
  config: { slots: ["09:00"], timeZone: "America/Sao_Paulo", lookbackHours: 48, hashtags: ["#achadodegaragem"] },
};

// 09:07 em São Paulo.
const now = new Date("2026-10-19T12:07:00Z");

const logWithOffer = recordOffer(
  emptyKitLog(),
  {
    key: "shopee:1",
    product: {
      source: "shopee",
      id: "1",
      title: "Câmera de Ré Automotiva",
      price: 79.9,
      currency: "BRL",
      url: "https://shopee.com.br/1",
    },
    affiliateUrl: "https://s.shopee.com.br/1",
    discountPercent: 20,
    foundAt: "2026-10-19T10:00:00Z",
  },
  now,
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadTikTokKit", () => {
  it("fica desligado sem TELEGRAM_KIT_CHAT_ID", async () => {
    await expect(loadTikTokKit({ TELEGRAM_KIT_CHAT_ID: "" })).resolves.toBeUndefined();
    await expect(loadTikTokKit({})).resolves.toBeUndefined();
  });

  it("exige o token do bot quando ligado", async () => {
    await expect(loadTikTokKit({ TELEGRAM_KIT_CHAT_ID: "999" })).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("lê os horários do config", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tiktok-config-"));
    const configPath = path.join(dir, "tiktok.json");
    await writeFile(configPath, JSON.stringify({ slots: ["10:30"] }));

    const loaded = await loadTikTokKit({ TELEGRAM_KIT_CHAT_ID: "999", TELEGRAM_BOT_TOKEN: "t" }, configPath);
    expect(loaded?.config).toEqual({
      slots: ["10:30"],
      timeZone: "America/Sao_Paulo",
      lookbackHours: 48,
      hashtags: [],
    });
  });
});

describe("runKitStep", () => {
  it("monta o vídeo, manda vídeo e instruções no Telegram e marca o horário", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const log = await runKitStep(kit, logWithOffer, now);

    const methods = fetchMock.mock.calls.map(([url]) => url.split("/").at(-1));
    expect(methods).toEqual(["sendVideo", "sendMessage"]);
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.get("chat_id")).toBe("999");
    expect(String(form.get("caption"))).toContain("#achadodegaragem");
    expect(form.get("video")).toBeInstanceOf(Blob);
    expect(log.servedSlots).toEqual(["2026-10-19 09:00"]);
    expect(log.offers["shopee:1"].kitAt).toBe(now.toISOString());

    // Mesmo horário de novo: não manda nada.
    fetchMock.mockClear();
    await runKitStep(kit, log, now);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);

  it("sem achado novo, não manda nada e deixa o horário aberto", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const log = await runKitStep(kit, emptyKitLog(), now);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.servedSlots).toEqual([]);
  });

  it("antes do primeiro horário não faz nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await runKitStep(kit, logWithOffer, new Date("2026-10-19T11:00:00Z"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
