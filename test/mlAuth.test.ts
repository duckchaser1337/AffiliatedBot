import { describe, expect, it } from "vitest";
import { extractAuthCode } from "../src/sources/mercadolivre/auth.js";

describe("extractAuthCode", () => {
  it("tira o código do endereço colado da barra do navegador", () => {
    expect(extractAuthCode(" https://github.com/arthurgaier/AffiliatedBot?code=TG-abc123-456 \n")).toBe("TG-abc123-456");
  });

  it("aceita só o código", () => {
    expect(extractAuthCode("TG-abc123-456")).toBe("TG-abc123-456");
  });

  it("recusa endereço sem código e texto qualquer", () => {
    expect(extractAuthCode("https://github.com/arthurgaier/AffiliatedBot?error=access_denied")).toBeUndefined();
    expect(extractAuthCode("não sei")).toBeUndefined();
    expect(extractAuthCode("")).toBeUndefined();
  });
});
