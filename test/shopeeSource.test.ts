import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShopeeSource } from "../src/sources/shopee/index.js";
import type { Product } from "../src/sources/types.js";

function offer(itemId: number, overrides: Record<string, unknown> = {}) {
  return {
    itemId,
    productName: `Produto ${itemId}`,
    priceMin: "50",
    ratingStar: "4.8",
    sales: 500,
    shopType: [],
    productLink: `https://shopee.com.br/product/1/${itemId}`,
    offerLink: `https://s.shopee.com.br/link${itemId}`,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

// Responde conforme a palavra-chave que aparece na query enviada.
function fetchByKeyword(responses: Record<string, unknown>) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const query = JSON.parse(init.body).query as string;
    const keyword = Object.keys(responses).find((k) => query.includes(JSON.stringify(k)));
    return jsonResponse(keyword ? responses[keyword] : { data: { productOfferV2: { nodes: [] } } });
  });
}

async function writeConfig(keywords: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "shopee-config-"));
  const configPath = path.join(dir, "shopee.json");
  await writeFile(configPath, JSON.stringify({ keywords, sortType: 2, limit: 20, minRating: 4.5, minSales: 50 }));
  return configPath;
}

async function collect(products: AsyncIterable<Product>): Promise<Product[]> {
  const result: Product[] = [];
  for await (const product of products) result.push(product);
  return result;
}

beforeEach(() => {
  vi.stubEnv("SHOPEE_APP_ID", "123456");
  vi.stubEnv("SHOPEE_APP_SECRET", "segredo");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createShopeeSource", () => {
  it("exige as credenciais da Shopee", () => {
    vi.stubEnv("SHOPEE_APP_SECRET", "");
    expect(() => createShopeeSource()).toThrow(/SHOPEE_APP_SECRET/);
  });

  it("junta as buscas sem repetir produto e aplica nota e vendas mínimas", async () => {
    vi.stubGlobal(
      "fetch",
      fetchByKeyword({
        aspirador: { data: { productOfferV2: { nodes: [offer(1), offer(2, { ratingStar: "4.1" })] } } },
        compressor: { data: { productOfferV2: { nodes: [offer(1), offer(3, { sales: 10 }), offer(4)] } } },
      }),
    );
    const source = createShopeeSource({ configPath: await writeConfig(["aspirador", "compressor"]) });

    const products = await collect(source.products());

    expect(products.map((p) => p.id)).toEqual(["1", "4"]);
    await expect(source.affiliateUrl(products[1])).resolves.toBe("https://s.shopee.com.br/link4");
  });

  it("segue com as outras buscas quando uma falha", async () => {
    vi.stubGlobal(
      "fetch",
      fetchByKeyword({
        aspirador: { errors: [{ extensions: { code: 11001, message: "Params error" } }] },
        compressor: { data: { productOfferV2: { nodes: [offer(7)] } } },
      }),
    );
    const source = createShopeeSource({ configPath: await writeConfig(["aspirador", "compressor"]) });

    await expect(collect(source.products())).resolves.toHaveLength(1);
  });

  it("vira erro quando todas as buscas falham (ex: credencial recusada)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ errors: [{ extensions: { code: 10020, message: "Invalid Signature" } }] })),
    );
    const source = createShopeeSource({ configPath: await writeConfig(["aspirador", "compressor"]) });

    await expect(collect(source.products())).rejects.toThrow(/Todas as buscas na Shopee falharam/);
  });
});
