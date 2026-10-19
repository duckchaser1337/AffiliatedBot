import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildKitInstructions, buildTikTokCaption } from "../src/tiktok/caption.js";
import type { KitOffer } from "../src/tiktok/kitLog.js";
import { FRAME_HEIGHT, FRAME_WIDTH, loadProductImage, renderKitFrames } from "../src/tiktok/render/frames.js";
import { framesToVideo } from "../src/tiktok/render/video.js";

// Gera um kit de EXEMPLO em preview/, sem enviar nada, pra conferir a arte e o vídeo.
//   npm run kit:preview                     → com uma foto de exemplo
//   npm run kit:preview -- <url-da-foto>    → com a foto de um produto real

const OUT_DIR = path.join(process.cwd(), "preview");

const sample: KitOffer = {
  key: "exemplo:1",
  product: {
    source: "shopee",
    id: "1",
    title: "Aspirador de Pó Automotivo Portátil 12V com Filtro e Bocais [EXEMPLO]",
    price: 89.9,
    currency: "BRL",
    url: "https://shopee.com.br/",
  },
  affiliateUrl: "https://s.shopee.com.br/exemplo",
  discountPercent: 23,
  previousPrice: 116.9,
  foundAt: new Date().toISOString(),
};

async function placeholderPhoto(): Promise<string> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#E8E8E8"/>` +
    `<rect x="250" y="330" width="400" height="240" rx="40" fill="#BDBDBD"/>` +
    `<circle cx="340" cy="590" r="50" fill="#8A8A8A"/><circle cx="560" cy="590" r="50" fill="#8A8A8A"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const photoUrl = process.argv[2];
const photo = photoUrl ? await loadProductImage(photoUrl) : await placeholderPhoto();

const started = Date.now();
const frames = await renderKitFrames(sample, photo);
const video = await framesToVideo(frames, { width: FRAME_WIDTH, height: FRAME_HEIGHT });

await mkdir(OUT_DIR, { recursive: true });
await Promise.all(frames.map((frame, index) => writeFile(path.join(OUT_DIR, `quadro-${index + 1}.png`), frame)));
await writeFile(path.join(OUT_DIR, "kit.mp4"), video);
await writeFile(
  path.join(OUT_DIR, "mensagens.txt"),
  `--- legenda (vai junto com o vídeo) ---\n${buildTikTokCaption(sample, ["#achadodegaragem", "#achadosautomotivos"])}\n\n` +
    `--- instruções (mensagem seguinte) ---\n${buildKitInstructions(sample, "2026-10-19 09:00")}\n`,
);

console.log(`Kit de exemplo em ${OUT_DIR} (${((Date.now() - started) / 1000).toFixed(1)}s, vídeo de ${(video.length / 1024).toFixed(0)} KB)`);
