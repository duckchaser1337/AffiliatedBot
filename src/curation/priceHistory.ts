import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface PriceObservation {
  price: number;
  observedAt: string;
}

export interface ItemHistory {
  observations: PriceObservation[];
  minPrice: number;
}

export interface PostedRecord {
  price: number;
  postedAt: string;
}

export interface State {
  items: Record<string, ItemHistory>;
  posted: Record<string, PostedRecord>;
}

const MAX_OBSERVATIONS_PER_ITEM = 90;

export function emptyState(): State {
  return { items: {}, posted: {} };
}

export function recordObservation(
  state: State,
  itemId: string,
  price: number,
  now: Date = new Date(),
): { state: State; previousMinPrice: number | undefined } {
  const existing = state.items[itemId];
  const previousMinPrice = existing?.minPrice;
  const observations = [...(existing?.observations ?? []), { price, observedAt: now.toISOString() }].slice(
    -MAX_OBSERVATIONS_PER_ITEM,
  );
  const minPrice = Math.min(price, existing?.minPrice ?? price);
  const nextState: State = {
    ...state,
    items: { ...state.items, [itemId]: { observations, minPrice } },
  };
  return { state: nextState, previousMinPrice };
}

export function recordPosted(state: State, itemId: string, price: number, now: Date = new Date()): State {
  return {
    ...state,
    posted: { ...state.posted, [itemId]: { price, postedAt: now.toISOString() } },
  };
}

export async function loadState(path: string): Promise<State> {
  try {
    const contents = await readFile(path, "utf8");
    return JSON.parse(contents) as State;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState();
    }
    throw error;
  }
}

export async function saveState(filePath: string, state: State): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}
