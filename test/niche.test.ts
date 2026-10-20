import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNiche, loadNicheRules, type NicheRules } from "../src/curation/niche.js";
import type { Product } from "../src/sources/types.js";

const rules: NicheRules = {
  blockedTerms: ["anti radar", "antirradar", "detector de radar", "xenon", "super led"],
  officialStoreOnlyTerms: ["freio", "pivo", "cadeirinha"],
};

function product(title: string, officialStore = false): Product {
  return {
    source: "mercadolivre",
    id: "MLB1",
    title,
    price: 99.9,
    currency: "BRL",
    url: "https://produto.mercadolivre.com.br/MLB1",
    officialStore,
  };
}

describe("checkNiche", () => {
  it("libera acessório comum", () => {
    expect(checkNiche(product("Aspirador Automotivo Portátil 12V"), rules).allowed).toBe(true);
  });

  it("bloqueia anti-radar em qualquer grafia, mesmo de loja oficial", () => {
    expect(checkNiche(product("Gel Anti-Radar Para Placa"), rules).allowed).toBe(false);
    expect(checkNiche(product("ANTIRRADAR spray"), rules).allowed).toBe(false);
    expect(checkNiche(product("Detector De Radar Com Voz", true), rules).allowed).toBe(false);
  });

  it("ignora acento e maiúsculas", () => {
    expect(checkNiche(product("Kit Xênon H4 8000K"), rules).allowed).toBe(false);
    expect(checkNiche(product("Lâmpada SUPER LED H7"), rules).allowed).toBe(false);
  });

  it("não bloqueia só por conter a palavra radar", () => {
    expect(checkNiche(product("Suporte GPS Com Alerta De Radar"), rules).allowed).toBe(true);
  });

  it("casa palavras inteiras", () => {
    expect(checkNiche(product("Suporte Celular Pivotante"), rules).allowed).toBe(true);
    expect(checkNiche(product("Pivô De Suspensão Dianteiro"), rules).allowed).toBe(false);
  });

  it("item de segurança só passa se vier de loja oficial", () => {
    const blocked = checkNiche(product("Pastilha De Freio Dianteira"), rules);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("loja oficial");
    expect(checkNiche(product("Pastilha De Freio Dianteira", true), rules).allowed).toBe(true);
  });
});

describe("config/niche.json", () => {
  it("é válido", async () => {
    const loaded = await loadNicheRules(path.join(process.cwd(), "config", "niche.json"));
    expect(loaded.blockedTerms.length).toBeGreaterThan(0);
    expect(checkNiche(product("Gel Anti-Radar Para Placa"), loaded).allowed).toBe(false);
    expect(checkNiche(product("Shampoo Automotivo Com Cera 1L"), loaded).allowed).toBe(true);
    // Liberados a pedido do dono do canal (19/10/2026).
    expect(checkNiche(product("Kit Xenon H4 8000K"), loaded).allowed).toBe(true);
    expect(checkNiche(product("Pastilha De Freio Dianteira"), loaded).allowed).toBe(true);
    expect(checkNiche(product("Kit Suspensão Rosca Gol G5"), loaded).allowed).toBe(true);
    // Termo de várias palavras vale mesmo com outra palavra no meio.
    expect(checkNiche(product("Insulfilm Azul Espelhado Para Carro 0,75x2m"), loaded).allowed).toBe(false);
    expect(checkNiche(product("Insulfilm Fumê G20 Para Carro"), loaded).allowed).toBe(true);
    // Pneu continua só de loja oficial.
    expect(checkNiche(product("Jogo De Pneus Aro 15"), loaded).allowed).toBe(false);
  });
});
