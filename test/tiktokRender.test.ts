import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { KitOffer } from "../src/tiktok/kitLog.js";
import { FRAME_HEIGHT, FRAME_WIDTH, renderKitFrames } from "../src/tiktok/render/frames.js";
import { framesToVideo } from "../src/tiktok/render/video.js";

const offer: KitOffer = {
  key: "shopee:1",
  product: {
    source: "shopee",
    id: "1",
    title: "Kit Microfibra Automotivo 10 Peças",
    price: 39.9,
    currency: "BRL",
    url: "https://shopee.com.br/1",
  },
  affiliateUrl: "https://s.shopee.com.br/1",
  discountPercent: 25,
  previousPrice: 53.2,
  foundAt: "2026-10-19T10:00:00Z",
};

async function solidPng(width: number, height: number, color: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

describe("renderKitFrames", () => {
  it("gera três quadros verticais 1080x1920, com e sem foto", async () => {
    const photo = `data:image/png;base64,${(await solidPng(400, 400, "#888888")).toString("base64")}`;
    for (const frames of [await renderKitFrames(offer, photo), await renderKitFrames(offer)]) {
      expect(frames).toHaveLength(3);
      for (const frame of frames) {
        const { width, height, format } = await sharp(frame).metadata();
        expect({ width, height, format }).toEqual({ width: FRAME_WIDTH, height: FRAME_HEIGHT, format: "png" });
      }
    }
  });
});

describe("framesToVideo", () => {
  // Também garante que o ffmpeg está disponível onde os testes rodam (inclusive no CI).
  it("monta um MP4 com os quadros", async () => {
    const frames = await Promise.all(["#FFC72C", "#141414"].map((color) => solidPng(216, 384, color)));
    const video = await framesToVideo(frames, { width: 216, height: 384, secondsPerFrame: 0.5, fps: 10 });
    expect(video.length).toBeGreaterThan(1000);
    expect(video.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });
});
