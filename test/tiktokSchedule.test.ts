import { describe, expect, it } from "vitest";
import { currentSlot } from "../src/tiktok/schedule.js";

const slots = ["09:00", "13:00", "19:00"];
const timeZone = "America/Sao_Paulo"; // UTC-3, sem horário de verão

describe("currentSlot", () => {
  it("antes do primeiro horário do dia não há kit", () => {
    expect(currentSlot(new Date("2026-10-19T11:59:00Z"), slots, timeZone)).toBeUndefined();
  });

  it("usa o horário local, não o UTC do GitHub Actions", () => {
    expect(currentSlot(new Date("2026-10-19T12:07:00Z"), slots, timeZone)).toBe("2026-10-19 09:00");
    expect(currentSlot(new Date("2026-10-19T16:37:00Z"), slots, timeZone)).toBe("2026-10-19 13:00");
  });

  it("depois da meia-noite UTC ainda é o mesmo dia em São Paulo", () => {
    expect(currentSlot(new Date("2026-10-20T02:30:00Z"), slots, timeZone)).toBe("2026-10-19 19:00");
  });

  it("só atende o horário mais recente, sem acumular os perdidos", () => {
    expect(currentSlot(new Date("2026-10-19T22:30:00Z"), ["19:00", "09:00", "13:00"], timeZone)).toBe(
      "2026-10-19 19:00",
    );
  });
});
