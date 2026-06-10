import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../../src/ai/prompt";
import type { CanonicalHint } from "../../src/ai/types";

describe("buildSystemPrompt", () => {
  it("incluye instrucciones clave (JSON only, null si ilegible, descuentos)", () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/JSON/i);
    expect(s).toMatch(/null/);
    expect(s).toMatch(/descuento/i);
    expect(s).toMatch(/suggested_canonical_id/);
  });
});

describe("buildUserPrompt", () => {
  it("con hints vacíos pone un placeholder explícito", () => {
    const u = buildUserPrompt([]);
    expect(u).toMatch(/no tiene productos/i);
  });

  it("con hints los lista por id, name y aliases", () => {
    const hints: CanonicalHint[] = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Leche Alpina 1L", aliases: ["LECHE ALPINA", "LCH ALPINA"] },
      { id: "22222222-2222-2222-2222-222222222222", name: "Pan Bimbo", aliases: ["PAN BIMBO"] },
    ];
    const u = buildUserPrompt(hints);
    expect(u).toContain("11111111-1111-1111-1111-111111111111");
    expect(u).toContain("Leche Alpina 1L");
    expect(u).toContain("LECHE ALPINA");
    expect(u).toContain("PAN BIMBO");
  });

  it("incluye un ejemplo de estructura JSON esperada", () => {
    const u = buildUserPrompt([]);
    expect(u).toMatch(/store_name/);
    expect(u).toMatch(/items/);
    expect(u).toMatch(/total_price/);
  });
});
