import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Product } from "../sources/types.js";

export interface KitOffer {
  key: string;
  product: Product;
  affiliateUrl: string;
  discountPercent: number;
  // Menor preço que o bot tinha visto antes da queda.
  previousPrice?: number;
  foundAt: string;
  kitAt?: string;
}

export interface KitLog {
  offers: Record<string, KitOffer>;
  servedSlots: string[];
}

const HOUR_MS = 3_600_000;
const KEEP_DAYS = 7;
const MAX_SERVED_SLOTS = 60;

export function emptyKitLog(): KitLog {
  return { offers: {}, servedSlots: [] };
}

// Guarda cada oferta que saiu nos canais: é daqui que o kit escolhe o achado de cada horário.
export function recordOffer(log: KitLog, offer: Omit<KitOffer, "kitAt">, now: Date = new Date()): KitLog {
  const cutoff = now.getTime() - KEEP_DAYS * 24 * HOUR_MS;
  const offers = Object.fromEntries(
    Object.entries(log.offers).filter(([, existing]) => Date.parse(existing.foundAt) >= cutoff),
  );
  // Mantém o kitAt: o mesmo produto não vira vídeo de novo dentro da janela.
  offers[offer.key] = { ...offer, kitAt: log.offers[offer.key]?.kitAt };
  return { ...log, offers };
}

// Maior queda real primeiro; empate, o mais recente.
export function pickOfferForKit(log: KitLog, now: Date, lookbackHours: number): KitOffer | undefined {
  const since = now.getTime() - lookbackHours * HOUR_MS;
  return Object.values(log.offers)
    .filter((offer) => !offer.kitAt && Date.parse(offer.foundAt) >= since)
    .sort((a, b) => b.discountPercent - a.discountPercent || Date.parse(b.foundAt) - Date.parse(a.foundAt))[0];
}

export function markKitSent(log: KitLog, key: string, slot: string, now: Date = new Date()): KitLog {
  const offer = log.offers[key];
  return {
    offers: offer ? { ...log.offers, [key]: { ...offer, kitAt: now.toISOString() } } : log.offers,
    servedSlots: [...log.servedSlots, slot].slice(-MAX_SERVED_SLOTS),
  };
}

export async function loadKitLog(filePath: string): Promise<KitLog> {
  try {
    const contents = await readFile(filePath, "utf8");
    return { ...emptyKitLog(), ...(JSON.parse(contents) as Partial<KitLog>) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyKitLog();
    }
    throw error;
  }
}

export async function saveKitLog(filePath: string, log: KitLog): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(log, null, 2), "utf8");
}
