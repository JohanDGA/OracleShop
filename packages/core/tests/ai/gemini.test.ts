import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../../src/ai/gemini";
import type { AIProviderInput } from "../../src/ai/types";
import { isAIError } from "../../src/ai/error";

const baseInput: AIProviderInput = {
  imageBase64: "AAAA",
  imageMimeType: "image/jpeg",
  canonicalHints: [],
  apiKey: "test-key",
};

const validResponseBody = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              store_name: "Éxito",
              purchased_at: "2026-06-09",
              total: "5000",
              currency: "COP",
              items: [
                {
                  raw_name: "Leche",
                  quantity: "1",
                  unit: "lt",
                  unit_price: "5000",
                  regular_price: null,
                  is_promo: false,
                  total_price: "5000",
                  suggested_canonical_id: null,
                  match_confidence: null,
                },
              ],
            }),
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiProvider.parseReceipt", () => {
  it("happy path: 200 con JSON válido → ParseResult", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(validResponseBody), { status: 200 }),
    );
    const provider = new GeminiProvider();
    const result = await provider.parseReceipt(baseInput);
    expect(result.store_name).toBe("Éxito");
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.raw_name).toBe("Leche");
  });

  it("envía la imagen como inlineData base64 con mimeType correcto", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponseBody), { status: 200 }));
    const provider = new GeminiProvider();
    await provider.parseReceipt({ ...baseInput, imageMimeType: "image/png", imageBase64: "ZZZ" });
    const call = mock.mock.calls[0];
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    const inline = body.contents[0].parts.find((p: { inlineData?: unknown }) => p.inlineData);
    expect(inline.inlineData.mimeType).toBe("image/png");
    expect(inline.inlineData.data).toBe("ZZZ");
  });

  it("pasa la API key como query param ?key=", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponseBody), { status: 200 }));
    const provider = new GeminiProvider();
    await provider.parseReceipt({ ...baseInput, apiKey: "my-secret" });
    const call = mock.mock.calls[0];
    expect((call![0] as string)).toContain("key=my-secret");
  });

  it("401 → AIError kind='auth'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("nope", { status: 401 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail("debió lanzar");
    } catch (e) {
      expect(isAIError(e)).toBe(true);
      if (isAIError(e)) expect(e.kind).toBe("auth");
    }
  });

  it("429 → AIError kind='rate_limit'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 429 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("rate_limit");
    }
  });

  it("JSON malformado → reintenta 1× con prompt estricto y luego AIError kind='parse'", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const badResponse = {
      candidates: [{ content: { parts: [{ text: "no soy json" }] } }],
    };
    mock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(badResponse), { status: 200 })),
    );
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("parse");
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retry-success: primera bad JSON → segunda válida → ParseResult", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const badResponse = { candidates: [{ content: { parts: [{ text: "no json" }] } }] };
    mock
      .mockResolvedValueOnce(new Response(JSON.stringify(badResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validResponseBody), { status: 200 }));
    const result = await new GeminiProvider().parseReceipt(baseInput);
    expect(result.items.length).toBeGreaterThan(0);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("items=[] → AIError kind='unreadable'", async () => {
    const empty = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  store_name: null,
                  purchased_at: "2026-06-09",
                  total: "0",
                  currency: "COP",
                  items: [],
                }),
              },
            ],
          },
        },
      ],
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify(empty), { status: 200 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("unreadable");
    }
  });
});
