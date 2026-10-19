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

// Produto do nicho visto recentemente, sem queda de preço: reserva pro "Achado do dia".
export interface PoolEntry {
  key: string;
  product: Product;
  affiliateUrl: string;
  seenAt: string;
  kitAt?: string;
}

export interface KitLog {
  offers: Record<string, KitOffer>;
  pool: Record<string, PoolEntry>;
  servedSlots: string[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const KEEP_DAYS = 7;
// Um produto da reserva só volta a virar vídeo depois de um mês.
const POOL_REUSE_DAYS = 30;
const MAX_SERVED_SLOTS = 60;

export function emptyKitLog(): KitLog {
  return { offers: {}, pool: {}, servedSlots: [] };
}

// Guarda cada oferta que saiu nos canais: é daqui que o kit escolhe o achado de cada horário.
export function recordOffer(log: KitLog, offer: Omit<KitOffer, "kitAt">, now: Date = new Date()): KitLog {
  const cutoff = now.getTime() - KEEP_DAYS * DAY_MS;
  const offers = Object.fromEntries(
    Object.entries(log.offers).filter(([, existing]) => Date.parse(existing.foundAt) >= cutoff),
  );
  // Mantém o kitAt: o mesmo produto não vira vídeo de novo dentro da janela.
  offers[offer.key] = { ...offer, kitAt: log.offers[offer.key]?.kitAt };
  return { ...log, offers };
}

// Guarda todo produto que passou pelo filtro do nicho, com ou sem queda.
export function recordSeen(log: KitLog, entry: Omit<PoolEntry, "kitAt">, now: Date = new Date()): KitLog {
  const cutoff = now.getTime() - KEEP_DAYS * DAY_MS;
  const pool = Object.fromEntries(
    Object.entries(log.pool).filter(([, existing]) => Date.parse(existing.seenAt) >= cutoff),
  );
  pool[entry.key] = { ...entry, kitAt: log.pool[entry.key]?.kitAt };
  return { ...log, pool };
}

// Maior queda real primeiro; empate, o mais recente.
export function pickOfferForKit(log: KitLog, now: Date, lookbackHours: number): KitOffer | undefined {
  const since = now.getTime() - lookbackHours * HOUR_MS;
  return Object.values(log.offers)
    .filter((offer) => !offer.kitAt && Date.parse(offer.foundAt) >= since)
    .sort((a, b) => b.discountPercent - a.discountPercent || Date.parse(b.foundAt) - Date.parse(a.foundAt))[0];
}

const rank = (flag: boolean | undefined): number => (flag ? 1 : 0);

// Sem queda de preço no horário: um produto da reserva vira "Achado do dia".
// Mais vendido primeiro, depois loja oficial, depois com foto.
export function pickFallbackForKit(log: KitLog, now: Date, lookbackHours: number): PoolEntry | undefined {
  const since = now.getTime() - lookbackHours * HOUR_MS;
  const reuseCutoff = now.getTime() - POOL_REUSE_DAYS * DAY_MS;
  const usedRecently = (kitAt: string | undefined) => kitAt !== undefined && Date.parse(kitAt) >= reuseCutoff;
  return Object.values(log.pool)
    .filter(
      (entry) =>
        Date.parse(entry.seenAt) >= since && !usedRecently(entry.kitAt) && !usedRecently(log.offers[entry.key]?.kitAt),
    )
    .sort(
      (a, b) =>
        rank(b.product.bestSeller) - rank(a.product.bestSeller) ||
        rank(b.product.officialStore) - rank(a.product.officialStore) ||
        rank(!!b.product.imageUrl) - rank(!!a.product.imageUrl) ||
        Date.parse(b.seenAt) - Date.parse(a.seenAt),
    )[0];
}

export function markKitSent(log: KitLog, key: string, slot: string, now: Date = new Date()): KitLog {
  const kitAt = now.toISOString();
  const offer = log.offers[key];
  const entry = log.pool[key];
  return {
    offers: offer ? { ...log.offers, [key]: { ...offer, kitAt } } : log.offers,
    pool: entry ? { ...log.pool, [key]: { ...entry, kitAt } } : log.pool,
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
