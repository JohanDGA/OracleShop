import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../../src/ai/openai";
import type { AIProviderInput } from "../../src/ai/types";
import { isAIError } from "../../src/ai/error";

const baseInput: AIProviderInput = {
  imageBase64: "AAAA",
  imageMimeType: "image/jpeg",
  canonicalHints: [],
  apiKey: "sk-openai-test",
};

const validResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          store_name: "D1",
          purchased_at: "2026-06-09",
          total: "3500",
          currency: "COP",
          items: [
            {
              raw_name: "Agua",
              quantity: "1",
              unit: "lt",
              unit_price: "3500",
              regular_price: null,
              is_promo: false,
              total_price: "3500",
              suggested_canonical_id: null,
              match_confidence: null,
            },
          ],
        }),
      },
    },
  ],
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("OpenAIProvider.parseReceipt", () => {
  it("happy path", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    const r = await new OpenAIProvider().parseReceipt(baseInput);
    expect(r.store_name).toBe("D1");
    expect(r.items[0]?.raw_name).toBe("Agua");
  });

  it("Authorization Bearer header", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new OpenAIProvider().parseReceipt(baseInput);
    const headers = (mock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-openai-test");
  });

  it("envía la imagen como image_url con data URL base64", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new OpenAIProvider().parseReceipt({ ...baseInput, imageBase64: "XYZ", imageMimeType: "image/webp" });
    const body = JSON.parse((mock.mock.calls[0]?.[1] as RequestInit).body as string);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    const imgPart = userMsg.content.find((c: { type: string }) => c.type === "image_url");
    expect(imgPart.image_url.url).toBe("data:image/webp;base64,XYZ");
  });

  it("401 → auth", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 401 }));
    try {
      await new OpenAIProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("auth");
    }
  });

  it("429 → rate_limit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 429 }));
    try {
      await new OpenAIProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("rate_limit");
    }
  });

  it("JSON malformado → retry estricto y luego parse", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const bad = { choices: [{ message: { content: "no json" } }] };
    mock.mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    try {
      await new OpenAIProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("parse");
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
