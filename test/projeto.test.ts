import { afterEach, describe, expect, it, vi } from "vitest";
import type { NicheRules } from "../src/curation/niche.js";
import { findSimilarPart } from "../src/projeto/findParts.js";
import { parseApproxPrice, parseProjectItems } from "../src/projeto/items.js";
import {
  buildOverlayLines,
  buildPrivateReport,
  buildProjectCaption,
  buildProjectPost,
  type PricedPart,
} from "../src/projeto/messages.js";

describe("parseApproxPrice", () => {
  it("entende os jeitos comuns de escrever valor", () => {
    expect(parseApproxPrice("2500")).toBe(2500);
    expect(parseApproxPrice("2.500")).toBe(2500);
    expect(parseApproxPrice("R$ 2.500,00")).toBe(2500);
    expect(parseApproxPrice("389,90")).toBe(389.9);
    expect(parseApproxPrice("12k")).toBe(12000);
    expect(parseApproxPrice("1,5k")).toBe(1500);
    expect(parseApproxPrice("12 mil")).toBe(12000);
    expect(parseApproxPrice("caro")).toBeUndefined();
  });
});

describe("parseProjectItems", () => {
  it("aceita link do Mercado Livre junto da peça", () => {
    expect(parseProjectItems("farol: 389 https://produto.mercadolivre.com.br/MLB-1-farol-_JM; grade: https://www.mercadolivre.com.br/p/MLB2")).toEqual([
      { label: "farol", approxPrice: 389, url: "https://produto.mercadolivre.com.br/MLB-1-farol-_JM" },
      { label: "grade", url: "https://www.mercadolivre.com.br/p/MLB2" },
    ]);
  });

  it("separa por ; ou linha e aceita peça sem valor", () => {
    expect(parseProjectItems("farol: 2500; roda aro 17: 12k\ninsulfilm: 600;  ;ponteira")).toEqual([
      { label: "farol", approxPrice: 2500 },
      { label: "roda aro 17", approxPrice: 12000 },
      { label: "insulfilm", approxPrice: 600 },
      { label: "ponteira" },
    ]);
  });
});

const parts: PricedPart[] = [
  { label: "farol", title: "Farol <Novo> & Original Gol G5 Máscara Negra", price: 389.9, affiliateUrl: "https://ml/p/1?a=1&b=2" },
  { label: "roda aro 17", title: "Jogo De Rodas Aro 17 Esportiva", price: 2499.5, affiliateUrl: "https://ml/p/2" },
];

describe("textos do projeto", () => {
  it("monta os textos do vídeo com o total batendo com os valores mostrados", () => {
    expect(buildOverlayLines(parts)).toEqual(["Farol + R$390", "Roda aro 17 + R$2.500", "TOTAL DO PROJETO: R$2.890"]);
  });

  it("legenda tem o título, o chamado pro Telegram e as hashtags", () => {
    expect(buildProjectCaption("Saveiro rebaixada", "Acesse o canal.", ["#rebaixados"])).toBe(
      "Saveiro rebaixada: quanto custa esse projeto?\n\nAcesse o canal.\n\n#rebaixados",
    );
    expect(buildProjectCaption(undefined, "Acesse o canal.", [])).toBe("Quanto custa esse projeto?\n\nAcesse o canal.");
  });

  it("post do canal lista as peças com link e o total exato, escapando HTML", () => {
    const post = buildProjectPost("Saveiro rebaixada", parts);
    expect(post.startsWith("🤯PROJETO ACHADO DE GARAGEM🤯\nSaveiro rebaixada\n")).toBe(true);
    expect(post).toContain("&lt;Novo&gt; &amp;");
    expect(post).toContain('<a href="https://ml/p/1?a=1&amp;b=2">Ver Oferta</a>');
    expect(post).toContain("<b>Total do projeto: R$2.889,40</b>");
    expect(post).not.toContain("compatibilidade");
  });

  it("relatório avisa peça sem parecida e se foi só prévia", () => {
    const report = buildPrivateReport({
      title: "Saveiro rebaixada",
      parts: [{ item: { label: "farol" }, via: "busca", problem: "nenhuma peça parecida à venda no catálogo" }],
      overlayLines: ["TOTAL DO PROJETO: R$0"],
      caption: "legenda",
      published: false,
    });
    expect(report).toContain("Farol → ficou de fora: nenhuma peça parecida à venda no catálogo");
    expect(report).toContain("Prévia: o canal ainda não recebeu nada");
  });
});

describe("findSimilarPart", () => {
  const rules: NicheRules = { blockedTerms: ["anti radar"], officialStoreOnlyTerms: [] };

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCatalog() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const { pathname } = new URL(url);
        if (pathname === "/products/search") {
          return json({
            results: [
              { id: "MLB1", name: "Roda Aro 17 Avulsa" },
              { id: "MLB2", name: "Jogo De Rodas Aro 17" },
              { id: "MLB3", name: "Roda Sem Vendedor" },
              { id: "MLB4", name: "Gel Anti-Radar" },
            ],
          });
        }
        const prices: Record<string, number> = { MLB1: 450, MLB2: 2800, MLB4: 30 };
        const id = pathname.split("/")[2];
        return prices[id]
          ? json({ results: [{ item_id: `${id}0`, price: prices[id], condition: "new" }] })
          : json({ message: "No winners found" }, 404);
      }),
    );
  }

  it("com valor aproximado, escolhe a peça de preço mais próximo", async () => {
    stubCatalog();
    const part = await findSimilarPart({ label: "roda aro 17", approxPrice: 12000 }, "token", rules);
    expect(part.product?.id).toBe("MLB2");
  });

  it("sem valor, fica com a mais relevante que tem vendedor e passa no filtro", async () => {
    stubCatalog();
    const part = await findSimilarPart({ label: "roda aro 17" }, "token", rules);
    expect(part.product?.id).toBe("MLB1");
  });

  it("fica só com o tipo de produto mais comum na busca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const { pathname } = new URL(url);
        if (pathname === "/products/search") {
          return json({
            results: [
              { id: "MLB1", name: "Revitalizador Farol Polímero 1L", domain_id: "MLB-VEHICLE_BRIGHTENERS" },
              { id: "MLB2", name: "Farol Saveiro G6 Máscara Negra", domain_id: "MLB-VEHICLE_HEADLIGHTS" },
              { id: "MLB3", name: "Par Farol Saveiro G6", domain_id: "MLB-VEHICLE_HEADLIGHTS" },
            ],
          });
        }
        const prices: Record<string, number> = { MLB1: 240, MLB2: 420, MLB3: 900 };
        const id = pathname.split("/")[2];
        return json({ results: [{ item_id: `${id}0`, price: prices[id], condition: "new" }] });
      }),
    );
    const part = await findSimilarPart({ label: "farol", approxPrice: 250 }, "token", rules);
    expect(part.product?.id).toBe("MLB2");
  });

  it("busca também com o modelo do carro e, sem nada à venda assim, fica com a peça sozinha", async () => {
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const { pathname, searchParams } = new URL(url);
        if (pathname === "/products/search") {
          queries.push(searchParams.get("q") ?? "");
          return searchParams.get("q") === "insulfilm"
            ? json({ results: [{ id: "MLB9", name: "Insulfilm Automotivo G20" }] })
            : json({ results: [] });
        }
        return json({ results: [{ item_id: "MLB90", price: 80, condition: "new" }] });
      }),
    );
    const part = await findSimilarPart({ label: "insulfilm" }, "token", rules, "saveiro g6");
    expect(queries).toEqual(["insulfilm", "insulfilm saveiro g6"]);
    expect(part.product?.id).toBe("MLB9");
  });

  type FakeResult = { id: string; name: string; domain_id?: string; price: number };

  // Catálogo falso: resultados da busca (todos com vendedor, no preço dado) e a previsão de tipo
  // do ML. Os dois podem ser um valor só pra qualquer busca ou um por texto buscado.
  function stubSearch(
    results: FakeResult[] | Record<string, FakeResult[]>,
    predicted?: string | Record<string, string>,
  ) {
    const resultsFor = (q: string) => (Array.isArray(results) ? results : (results[q] ?? []));
    const all = Array.isArray(results) ? results : Object.values(results).flat();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const { pathname, searchParams } = new URL(url);
        const q = searchParams.get("q") ?? "";
        if (pathname === "/sites/MLB/domain_discovery/search") {
          const domain = typeof predicted === "string" ? predicted : predicted?.[q];
          return json(domain ? [{ domain_id: domain }] : []);
        }
        if (pathname === "/products/search") {
          return json({ results: resultsFor(q).map(({ price: _price, ...product }) => product) });
        }
        const id = pathname.split("/")[2];
        const price = all.find((result) => result.id === id)?.price;
        return json({ results: [{ item_id: `${id}0`, price, condition: "new" }] });
      }),
    );
  }

  it("não troca a medida da peça: roda aro 17 não vira aro 18", async () => {
    stubSearch([
      { id: "MLB1", name: "Jogo Roda Aro 18 Thor Saveiro G6", price: 5099 },
      { id: "MLB2", name: "Roda Aro 17 Ramlow Saveiro", price: 931 },
    ]);
    const part = await findSimilarPart({ label: "roda aro 17", approxPrice: 5000 }, "token", rules);
    expect(part.product?.id).toBe("MLB2");
  });

  it("explica quando nada à venda tem a medida pedida", async () => {
    stubSearch([{ id: "MLB1", name: "Jogo Roda Aro 18 Thor", price: 5099 }]);
    const part = await findSimilarPart({ label: "roda aro 17" }, "token", rules);
    expect(part.problem).toContain("medida pedida (17)");
  });

  it("usa o tipo de produto que o ML prevê, mesmo sendo minoria na busca", async () => {
    stubSearch(
      [
        { id: "MLB1", name: "Insulfilm Decorativo Janela", domain_id: "MLB-VINYL_ROLLS_AND_SHEETS", price: 40 },
        { id: "MLB2", name: "Insulfilm Blackout Casa", domain_id: "MLB-VINYL_ROLLS_AND_SHEETS", price: 35 },
        { id: "MLB3", name: "Película Insulfilm Automotiva G20", domain_id: "MLB-VEHICLE_TINTED_GLASSES", price: 29 },
      ],
      "MLB-VEHICLE_TINTED_GLASSES",
    );
    const part = await findSimilarPart({ label: "insulfilm" }, "token", rules);
    expect(part.product?.id).toBe("MLB3");
  });

  it("ignora a previsão que não aparece na busca", async () => {
    stubSearch(
      [
        { id: "MLB1", name: "Kit Rebaixamento Fixo", domain_id: "MLB-PERFORMANCE_SUSPENSION_KITS", price: 900 },
        { id: "MLB2", name: "Kit Rebaixamento Rosca", domain_id: "MLB-PERFORMANCE_SUSPENSION_KITS", price: 1500 },
      ],
      "MLB-MANUAL_EDGE_BANDING_TRIMMERS",
    );
    const part = await findSimilarPart({ label: "kit rebaixamento" }, "token", rules);
    expect(part.product?.id).toBe("MLB1");
  });

  it("previsão errada pra peça sozinha usa a previsão com o carro", async () => {
    const fabric = { domain_id: "MLB-FABRICS", price: 361 };
    stubSearch(
      {
        "kit rebaixamento": [
          { id: "MLB1", name: "Helanquinha Para Rebaixamento De Teto", ...fabric },
          { id: "MLB2", name: "Tecido Rebaixamento Teto", ...fabric },
        ],
        "kit rebaixamento Saveiro G6": [
          { id: "MLB3", name: "Kit Rebaixamento Rosca Saveiro G6", domain_id: "MLB-PERFORMANCE_SUSPENSION_KITS", price: 1200 },
        ],
      },
      {
        "kit rebaixamento": "MLB-MANUAL_EDGE_BANDING_TRIMMERS",
        "kit rebaixamento Saveiro G6": "MLB-PERFORMANCE_SUSPENSION_KITS",
      },
    );
    const part = await findSimilarPart({ label: "kit rebaixamento" }, "token", rules, "Saveiro G6");
    expect(part.product?.id).toBe("MLB3");
  });

  it("o tipo da peça vale também na busca com o carro", async () => {
    stubSearch(
      {
        ponteira: [{ id: "MLB1", name: "Ponteira Escapamento Esportiva Inox", domain_id: "MLB-VEHICLE_EXHAUST_TIPS", price: 280 }],
        "ponteira Saveiro G6": [
          { id: "MLB2", name: "Polaina Ponteira Para-choque Saveiro", domain_id: "MLB-VEHICLE_BUMPER_CAPS", price: 53 },
        ],
      },
      { ponteira: "MLB-VEHICLE_EXHAUST_TIPS", "ponteira Saveiro G6": "MLB-VEHICLE_BUMPER_CAPS" },
    );
    const part = await findSimilarPart({ label: "ponteira", approxPrice: 300 }, "token", rules, "Saveiro G6");
    expect(part.product?.id).toBe("MLB1");
  });

  it("com o carro, prefere a peça que cita o modelo mesmo com preço mais longe", async () => {
    stubSearch([
      { id: "MLB1", name: "Roda Aro 17 Renault Logan", price: 2615 },
      { id: "MLB2", name: "Roda Aro 17 Ramlow Gol Saveiro", price: 931 },
    ]);
    const part = await findSimilarPart({ label: "roda aro 17", approxPrice: 12000 }, "token", rules, "Saveiro G6");
    expect(part.product?.id).toBe("MLB2");
  });

  it("sem nada à venda, devolve a peça sem produto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [] })));
    const part = await findSimilarPart({ label: "peça rara" }, "token", rules);
    expect(part.product).toBeUndefined();
  });
});

describe("peça com link", () => {
  const rules: NicheRules = { blockedTerms: ["anti radar"], officialStoreOnlyTerms: [] };

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("anúncio comum usa o preço informado e o nome do endereço, sem chamar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const part = await findSimilarPart(
      {
        label: "farol",
        approxPrice: 389.9,
        url: "https://produto.mercadolivre.com.br/MLB-4542401423-farol-saveiro-g6-mascara-negra-_JM?matt_word=x#tab",
      },
      "token",
      rules,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(part.via).toBe("link");
    expect(part.product).toMatchObject({
      title: "Farol Saveiro G6 Mascara Negra",
      price: 389.9,
      url: "https://produto.mercadolivre.com.br/MLB-4542401423-farol-saveiro-g6-mascara-negra-_JM",
    });
  });

  it("link de catálogo lê preço e oferta pela API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new URL(url).pathname.endsWith("/items")
          ? json({ results: [{ item_id: "MLB77", price: 459, condition: "new" }] })
          : json({ id: "MLB25804364", name: "Grade Saveiro G6" }),
      ),
    );
    const part = await findSimilarPart(
      { label: "grade", url: "https://www.mercadolivre.com.br/grade-saveiro/p/MLB25804364" },
      "token",
      rules,
    );
    expect(part.product?.price).toBe(459);
    expect(part.product?.url).toContain("pdp_filters=item_id%3AMLB77");
  });

  it("explica o que falta quando o link não basta", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const semPreco = await findSimilarPart({ label: "farol", url: "https://produto.mercadolivre.com.br/MLB-1-farol-_JM" }, "t", rules);
    expect(semPreco.problem).toContain("informe o preço");
    const curto = await findSimilarPart({ label: "farol", approxPrice: 300, url: "https://meli.la/1akq7kF" }, "t", rules);
    expect(curto.problem).toContain("meli.la");
    const shopee = await findSimilarPart({ label: "farol", approxPrice: 300, url: "https://shopee.com.br/x" }, "t", rules);
    expect(shopee.problem).toContain("só links do Mercado Livre");
  });
});
