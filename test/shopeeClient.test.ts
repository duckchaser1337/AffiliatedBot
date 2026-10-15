import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL, buildAuthHeader, searchProductOffers, ShopeeApiError } from "../src/sources/shopee/client.js";

const credentials = { appId: "123456", secret: "segredo" };
const options = { sortType: 2, limit: 20 };

const offer = {
  itemId: 22812345678,
  productName: "Aspirador Automotivo 12V",
  priceMin: "89.9",
  ratingStar: "4.8",
  sales: 1200,
  imageUrl: "https://down-br.img.susercontent.com/file/abc",
  shopType: [1],
  productLink: "https://shopee.com.br/product/1/22812345678",
  offerLink: "https://s.shopee.com.br/abc123",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAuthHeader", () => {
  it("assina AppId + timestamp + corpo + secret com SHA-256", () => {
    const body = '{"query":"{ x }"}';
    const expected = createHash("sha256").update(`1234561700000000${body}segredo`).digest("hex");
    expect(buildAuthHeader("123456", "segredo", body, 1700000000)).toBe(
      `SHA256 Credential=123456, Timestamp=1700000000, Signature=${expected}`,
    );
  });
});

describe("searchProductOffers", () => {
  it("envia corpo e assinatura que batem entre si", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { productOfferV2: { nodes: [offer] } } }));
    vi.stubGlobal("fetch", fetchMock);

    const offers = await searchProductOffers('camera de "ré"', options, credentials, 0);

    expect(offers).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(API_URL);
    const body = init.body as string;
    expect(JSON.parse(body).query).toContain('keyword: "camera de \\"ré\\""');
    const timestamp = Number(/Timestamp=(\d+)/.exec(init.headers.Authorization)?.[1]);
    expect(init.headers.Authorization).toBe(buildAuthHeader("123456", "segredo", body, timestamp));
  });

  it("tenta de novo quando a Shopee pede pra esperar (10030)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ errors: [{ extensions: { code: 10030, message: "rate limit" } }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { productOfferV2: { nodes: [offer] } } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchProductOffers("aspirador", options, credentials, 0)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não insiste quando a credencial é recusada (10020)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ errors: [{ extensions: { code: 10020, message: "Invalid Signature" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await searchProductOffers("aspirador", options, credentials, 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShopeeApiError);
    expect((error as ShopeeApiError).code).toBe(10020);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignora oferta malformada sem perder as outras", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { productOfferV2: { nodes: [offer, { itemId: 1 }] } } }));
    vi.stubGlobal("fetch", fetchMock);

    const offers = await searchProductOffers("aspirador", options, credentials, 0);
    expect(offers.map((o) => o.productName)).toEqual(["Aspirador Automotivo 12V"]);
  });
});
