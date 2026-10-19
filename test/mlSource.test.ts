import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMercadoLivreSource } from "../src/sources/mercadolivre/index.js";
import { decryptToken, encryptToken } from "../src/sources/mercadolivre/tokenStore.js";
import type { Product } from "../src/sources/types.js";

const key = randomBytes(32).toString("base64");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// API simulada: cada rota do Mercado Livre devolve uma resposta fixa.
function fakeApi(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string) => {
    const { pathname, search } = new URL(url);
    const route = Object.keys(routes).find((pattern) => `${pathname}${search}`.startsWith(pattern));
    return route ? routes[route]() : json({ message: "not mocked" }, 500);
  });
}

const tokenRoute = { "/oauth/token": () => json({ access_token: "acc", refresh_token: "TG-novo", expires_in: 21600, token_type: "Bearer" }) };

async function setup(watchlist: unknown) {
  const dir = await mkdtemp(path.join(tmpdir(), "ml-source-"));
  const tokenPath = path.join(dir, "ml-token.enc");
  const watchlistPath = path.join(dir, "watchlist.json");
  await writeFile(tokenPath, encryptToken("TG-antigo", key));
  await writeFile(watchlistPath, JSON.stringify(watchlist));
  return { tokenPath, source: createMercadoLivreSource({ tokenPath, watchlistPath }) };
}

async function collect(products: AsyncIterable<Product>): Promise<Product[]> {
  const result: Product[] = [];
  for await (const product of products) result.push(product);
  return result;
}

beforeEach(() => {
  vi.stubEnv("ML_CLIENT_ID", "123");
  vi.stubEnv("ML_CLIENT_SECRET", "segredo");
  vi.stubEnv("ML_TOKEN_ENCRYPTION_KEY", key);
  vi.stubEnv("ML_AFFILIATE_MATT_WORD", "ag2026");
  vi.stubEnv("ML_AFFILIATE_MATT_TOOL", "23433625");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createMercadoLivreSource (catálogo)", () => {
  it("junta mais vendidos e busca, pega a oferta nova mais barata e pula produto sem vendedor", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi({
        ...tokenRoute,
        "/highlights/MLB/category/CAT1": () =>
          json({ content: [{ id: "MLB2", type: "PRODUCT" }, { id: "MLBU9", type: "USER_PRODUCT" }, { id: "MLB1", type: "PRODUCT" }] }),
        "/products/search": () =>
          json({ results: [{ id: "MLB1", name: "Aspirador A", pictures: [{ url: "https://http2.mlstatic.com/a.jpg" }] }, { id: "MLB3", name: "Sem vendedor" }] }),
        "/products/MLB2/items": () => json({ results: [{ item_id: "MLB200", price: 30, condition: "new" }] }),
        "/products/MLB1/items": () =>
          json({
            results: [
              { item_id: "MLB100", price: 50, condition: "new", official_store_id: null },
              { item_id: "MLB101", price: 40, condition: "used" },
              { item_id: "MLB102", price: 45, condition: "new", official_store_id: 7 },
            ],
          }),
        "/products/MLB3/items": () => json({ message: "No winners found", error: "not_found", status: 404 }, 404),
        "/products/MLB2": () => json({ id: "MLB2", name: "Suporte B" }),
      }),
    );
    const { tokenPath, source } = await setup({ highlightCategories: ["CAT1"], searchQueries: ["aspirador"] });

    const products = await collect(source.products());

    expect(products.map((p) => [p.id, p.title, p.price, p.officialStore])).toEqual([
      ["MLB2", "Suporte B", 30, false],
      ["MLB1", "Aspirador A", 45, true],
    ]);
    expect(decryptToken(await readFile(tokenPath, "utf8"), key)).toBe("TG-novo");

    const link = new URL(await source.affiliateUrl(products[1]));
    expect(link.searchParams.get("pdp_filters")).toBe("item_id:MLB102");
    expect(link.searchParams.get("matt_word")).toBe("ag2026");
    expect(link.searchParams.get("matt_tool")).toBe("23433625");
  });

  it("vira erro quando todas as buscas falham", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi({
        ...tokenRoute,
        "/highlights": () => json({ message: "forbidden" }, 403),
        "/products/search": () => json({ message: "forbidden" }, 403),
      }),
    );
    const { source } = await setup({ highlightCategories: ["CAT1"], searchQueries: ["aspirador"] });

    await expect(collect(source.products())).rejects.toThrow(/Todas as buscas no Mercado Livre falharam/);
  });

  it("segue quando só uma das buscas falha", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi({
        ...tokenRoute,
        "/highlights": () => json({ message: "forbidden" }, 403),
        "/products/search": () => json({ results: [{ id: "MLB1", name: "Aspirador A" }] }),
        "/products/MLB1/items": () => json({ results: [{ item_id: "MLB100", price: 50, condition: "new" }] }),
      }),
    );
    const { source } = await setup({ highlightCategories: ["CAT1"], searchQueries: ["aspirador"] });

    await expect(collect(source.products())).resolves.toHaveLength(1);
  });
});
