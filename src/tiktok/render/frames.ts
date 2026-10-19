import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori, { type SatoriOptions } from "satori";
import sharp from "sharp";
import { formatBRL, productHeadline } from "../../content/format.js";
import { logger } from "../../logger.js";
import type { KitOffer } from "../kitLog.js";

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

// Identidade "Oficina" do Achado de Garagem.
const YELLOW = "#FFC72C";
const BLACK = "#141414";
const GRAPHITE = "#3A3A3A";

// Fora da área que o TikTok cobre com legenda (embaixo) e botões (à direita).
// Lados separados: o satori não respeita o atalho "padding: a b c d".
const SAFE_AREA = { paddingTop: 150, paddingRight: 150, paddingBottom: 380, paddingLeft: 90 };
const CONTENT_WIDTH = FRAME_WIDTH - SAFE_AREA.paddingLeft - SAFE_AREA.paddingRight;

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT_FILES = [
  { file: "Anton-Regular.ttf", name: "Anton", weight: 400 },
  { file: "Barlow-Medium.ttf", name: "Barlow", weight: 500 },
  { file: "Barlow-SemiBold.ttf", name: "Barlow", weight: 600 },
  { file: "Barlow-Bold.ttf", name: "Barlow", weight: 700 },
] as const;

let fontsPromise: Promise<SatoriOptions["fonts"]> | undefined;

function loadFonts(): Promise<SatoriOptions["fonts"]> {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ({ file, name, weight }) => ({
      name,
      weight,
      style: "normal" as const,
      data: await readFile(path.join(FONT_DIR, file)),
    })),
  );
  return fontsPromise;
}

type Style = Record<string, string | number>;
type Child = Element | string;
interface Element {
  type: string;
  props: { style?: Style; children?: Child[]; src?: string; width?: number; height?: number };
}

// O satori desenha a partir desta árvore (sem React); todo container precisa de display flex.
function box(style: Style, ...children: Child[]): Element {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

function image(src: string, width: number, height: number, style: Style = {}): Element {
  return { type: "img", props: { src, width, height, style } };
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Faixa zebrada de sinalização.
function hazardStripe(width: number, height: number): string {
  const step = 36;
  let stripes = "";
  for (let x = -height; x < width + height; x += step * 2) {
    stripes += `<polygon points="${x},${height} ${x + step},${height} ${x + step + height},0 ${x + height},0" fill="${BLACK}"/>`;
  }
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${YELLOW}"/>${stripes}</svg>`,
  );
}

// Símbolo da marca: lupa com cabo de chave de boca.
const LOGO = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${YELLOW}"/>` +
    `<g transform="translate(50 50) scale(0.86) translate(-54 -54)">` +
    `<circle cx="42" cy="42" r="20" fill="none" stroke="${BLACK}" stroke-width="9"/>` +
    `<path d="M50 0 C54 36 64 46 100 50 C64 54 54 64 50 100 C46 64 36 54 0 50 C36 46 46 36 50 0 Z" fill="${BLACK}" transform="translate(42 42) scale(0.2) translate(-50 -50)"/>` +
    `<path d="M57 57 L74 74" stroke="${BLACK}" stroke-width="11" stroke-linecap="round"/>` +
    `<circle cx="79" cy="79" r="11" fill="${BLACK}"/><circle cx="79" cy="79" r="4.5" fill="${YELLOW}"/></g></svg>`,
);

// Foto do produto num quadro branco; sem foto, o nome do produto ocupa o lugar.
function productCard(offer: KitOffer, photo: string | undefined, height: number): Element {
  const inner = photo
    ? image(photo, CONTENT_WIDTH - 96, height - 96, { objectFit: "contain" })
    : box(
        { fontFamily: "Barlow", fontWeight: 700, fontSize: 64, textAlign: "center", padding: 48 },
        productHeadline(offer.product.title, 60),
      );
  return box(
    {
      width: CONTENT_WIDTH,
      height,
      background: "#FFFFFF",
      border: `8px solid ${BLACK}`,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    inner,
  );
}

function stripe(): Element {
  return box(
    { width: CONTENT_WIDTH, border: `6px solid ${BLACK}` },
    image(hazardStripe(CONTENT_WIDTH - 12, 40), CONTENT_WIDTH - 12, 40),
  );
}

function hookFrame(offer: KitOffer, photo: string | undefined): Element {
  const headline = offer.discountPercent >= 1 ? `BAIXOU ${offer.discountPercent.toFixed(0)}%` : "ACHADO DO DIA";
  return box(
    {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      background: YELLOW,
      color: BLACK,
      flexDirection: "column",
      ...SAFE_AREA,
      gap: 36,
    },
    box(
      {
        alignSelf: "flex-start",
        background: BLACK,
        color: YELLOW,
        fontFamily: "Anton",
        fontSize: 44,
        padding: "10px 22px",
        borderRadius: 10,
      },
      "ACHADO DE GARAGEM",
    ),
    box({ fontFamily: "Anton", fontSize: 150, lineHeight: 1 }, headline),
    productCard(offer, photo, 760),
    stripe(),
  );
}

function detailFrame(offer: KitOffer, photo: string | undefined): Element {
  const previous = offer.previousPrice
    ? box(
        { fontFamily: "Barlow", fontWeight: 600, fontSize: 40, color: GRAPHITE, textDecoration: "line-through" },
        `antes ${formatBRL(offer.previousPrice)}`,
      )
    : box({});
  return box(
    {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      background: YELLOW,
      color: BLACK,
      flexDirection: "column",
      ...SAFE_AREA,
      gap: 36,
    },
    productCard(offer, photo, 640),
    box(
      { width: CONTENT_WIDTH, fontFamily: "Barlow", fontWeight: 700, fontSize: 60, lineHeight: 1.15 },
      productHeadline(offer.product.title, 80),
    ),
    box(
      {
        alignSelf: "flex-start",
        background: BLACK,
        color: YELLOW,
        fontFamily: "Anton",
        fontSize: 140,
        lineHeight: 1,
        padding: "16px 32px",
        borderRadius: 16,
      },
      formatBRL(offer.product.price),
    ),
    box(
      { alignItems: "center", gap: 24 },
      offer.discountPercent >= 1
        ? box({ fontFamily: "Anton", fontSize: 72 }, `-${offer.discountPercent.toFixed(0)}%`)
        : box({}),
      previous,
    ),
  );
}

function ctaFrame(): Element {
  // Bloco central em posição fixa: com padding + centralização, o satori desloca o conteúdo.
  return box(
    { width: FRAME_WIDTH, height: FRAME_HEIGHT, background: BLACK },
    box(
      {
        position: "absolute",
        top: SAFE_AREA.paddingTop,
        left: SAFE_AREA.paddingLeft,
        width: CONTENT_WIDTH,
        height: FRAME_HEIGHT - SAFE_AREA.paddingTop - SAFE_AREA.paddingBottom,
        color: "#FFFFFF",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
      },
      image(LOGO, 320, 320),
      box({ fontFamily: "Anton", fontSize: 170, lineHeight: 1, color: YELLOW }, "LINK NA BIO"),
      box({ fontFamily: "Barlow", fontWeight: 600, fontSize: 54 }, "e no canal do Telegram"),
      box({ fontFamily: "Anton", fontSize: 60, letterSpacing: 2, color: YELLOW }, "ACHADO DE GARAGEM"),
    ),
  );
}

async function toPng(element: Element): Promise<Buffer> {
  const svg = await satori(element as unknown as Parameters<typeof satori>[0], {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    fonts: await loadFonts(),
  });
  return new Resvg(svg).render().asPng();
}

// Três quadros: gancho (queda de preço), detalhe (nome e preço) e chamada (link na bio).
export async function renderKitFrames(offer: KitOffer, photo?: string): Promise<Buffer[]> {
  return Promise.all([hookFrame(offer, photo), detailFrame(offer, photo), ctaFrame()].map(toPng));
}

// Baixa a foto e converte pra PNG em fundo branco (a origem pode vir em WebP).
export async function loadProductImage(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`resposta ${response.status}`);
    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(900, 900, { fit: "contain", background: "#FFFFFF" })
      .flatten({ background: "#FFFFFF" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    logger.warn("Não consegui baixar a foto do produto, o vídeo sai sem foto", { url, error: String(error) });
    return undefined;
  }
}
