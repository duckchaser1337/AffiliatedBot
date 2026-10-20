import { formatBRL, productHeadline } from "../content/format.js";
import type { ProjectPart } from "./findParts.js";

export interface PricedPart {
  label: string;
  title: string;
  price: number;
  affiliateUrl: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}

// "R$2.340": valor inteiro, sem espaço, pra caber no texto por cima do vídeo.
function roundedBRL(value: number): string {
  return `R$${Math.round(value).toLocaleString("pt-BR")}`;
}

// "R$389,90", sem o espaço que o formato de moeda põe depois do R$ (padrão do canal).
function compactBRL(value: number): string {
  return formatBRL(value).replace(/\s/g, "");
}

// Textos pra colar por cima do vídeo, na ordem em que as peças aparecem, e o total no fim.
// O total é a soma dos valores arredondados mostrados, pra conta bater na tela.
export function buildOverlayLines(parts: readonly PricedPart[]): string[] {
  const rounded = parts.map((part) => Math.round(part.price));
  const total = rounded.reduce((sum, value) => sum + value, 0);
  return [
    ...parts.map((part, index) => `${capitalize(part.label)} + ${roundedBRL(rounded[index])}`),
    `TOTAL DO PROJETO: ${roundedBRL(total)}`,
  ];
}

export function buildProjectCaption(title: string | undefined, cta: string, hashtags: readonly string[]): string {
  const opening = title ? `${title}: quanto custa esse projeto?` : "Quanto custa esse projeto?";
  return [opening, "", cta, "", hashtags.join(" ")].join("\n").trim();
}

// Post do canal: as peças parecidas com link de afiliado e o total.
export function buildProjectPost(title: string | undefined, parts: readonly PricedPart[]): string {
  const total = parts.reduce((sum, part) => sum + part.price, 0);
  const lines = parts.map(
    (part) =>
      `• <b>${escapeHtml(capitalize(part.label))}</b>: ${escapeHtml(productHeadline(part.title, 45))} — ` +
      `${compactBRL(part.price)} · <a href="${escapeHtml(part.affiliateUrl)}">Ver Oferta</a>`,
  );
  return [
    "🤯PROJETO ACHADO DE GARAGEM🤯",
    ...(title ? [escapeHtml(title)] : []),
    "",
    "Peças parecidas com as do vídeo:",
    "",
    ...lines,
    "",
    `<b>Total do projeto: ${compactBRL(total)}</b>`,
  ].join("\n");
}

// Relatório no privado: textos do vídeo, legenda e o que o bot escolheu pra cada peça.
export function buildPrivateReport(options: {
  title?: string;
  parts: readonly ProjectPart[];
  overlayLines: readonly string[];
  caption: string;
  published: boolean;
}): string {
  const choices = options.parts.map((part) => {
    const label = capitalize(part.item.label);
    if (!part.product) return `- ${label} → ficou de fora: ${part.problem ?? "nenhuma peça encontrada"}`;
    const origin = part.via === "link" ? " (link)" : "";
    return `- ${label}${origin} → ${productHeadline(part.product.title, 60)} (${compactBRL(part.product.price)})`;
  });
  return [
    `Projeto${options.title ? `: ${options.title}` : ""}`,
    "",
    "Textos pro vídeo, na ordem:",
    ...options.overlayLines,
    "",
    "Legenda:",
    options.caption,
    "",
    "Peças escolhidas:",
    ...choices,
    "",
    options.published
      ? "Post publicado no canal."
      : "Prévia: o canal ainda não recebeu nada. Se estiver ok, rode de novo com publicar = true.",
  ].join("\n");
}
