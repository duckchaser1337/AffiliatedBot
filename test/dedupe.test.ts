import { describe, expect, it } from "vitest";
import { shouldSkipAsDuplicate } from "../src/curation/dedupe.js";

describe("shouldSkipAsDuplicate", () => {
  it("não pula se nunca foi postado", () => {
    expect(shouldSkipAsDuplicate(undefined, 100, 15)).toBe(false);
  });

  it("pula se o preço não caiu desde o último post", () => {
    expect(shouldSkipAsDuplicate({ price: 100, postedAt: "2026-01-01" }, 100, 15)).toBe(true);
  });

  it("pula se a queda desde o último post é menor que o limiar", () => {
    expect(shouldSkipAsDuplicate({ price: 100, postedAt: "2026-01-01" }, 90, 15)).toBe(true);
  });

  it("permite repostar se a queda desde o último post passa do limiar de novo", () => {
    expect(shouldSkipAsDuplicate({ price: 100, postedAt: "2026-01-01" }, 80, 15)).toBe(false);
  });
});
