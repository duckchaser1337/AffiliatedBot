import { describe, expect, it } from "vitest";
import { loadSettings } from "../src/config/env.js";

describe("loadSettings", () => {
  it("usa os padrões quando nada é configurado", () => {
    const settings = loadSettings({});
    expect(settings.SOURCES).toEqual(["mercadolivre"]);
    expect(settings.CHANNELS).toEqual(["telegram"]);
    expect(settings.DISCOUNT_THRESHOLD_PERCENT).toBe(15);
  });

  it("trata string vazia (variável não cadastrada no GitHub) como padrão", () => {
    expect(loadSettings({ SOURCES: "", CHANNELS: " " }).SOURCES).toEqual(["mercadolivre"]);
  });

  it("aceita lista separada por vírgula e remove repetidos", () => {
    expect(loadSettings({ CHANNELS: "telegram, telegram" }).CHANNELS).toEqual(["telegram"]);
  });

  it("rejeita fonte ou canal desconhecido", () => {
    expect(() => loadSettings({ SOURCES: "aliexpress" })).toThrow(/Configuração inválida/);
    expect(() => loadSettings({ CHANNELS: "orkut" })).toThrow(/Configuração inválida/);
  });
});
