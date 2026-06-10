import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeProvider } from "../../src/ai/claude";
import type { AIProviderInput } from "../../src/ai/types";
import { isAIError } from "../../src/ai/error";

const baseInput: AIProviderInput = {
  imageBase64: "AAAA",
  imageMimeType: "image/jpeg",
  canonicalHints: [],
  apiKey: "sk-ant-test",
};

const validResponse = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        store_name: "Carulla",
        purchased_at: "2026-06-09",
        total: "8000",
        currency: "COP",
        items: [
          {
            raw_name: "Pan",
            quantity: "1",
            unit: "un",
            unit_price: "8000",
            regular_price: null,
            is_promo: false,
            total_price: "8000",
            suggested_canonical_id: null,
            match_confidence: null,
          },
        ],
      }),
    },
  ],
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("ClaudeProvider.parseReceipt", () => {
  it("happy path", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    const result = await new ClaudeProvider().parseReceipt(baseInput);
    expect(result.store_name).toBe("Carulla");
    expect(result.items[0]?.raw_name).toBe("Pan");
  });

  it("envía x-api-key header y anthropic-version", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new ClaudeProvider().parseReceipt(baseInput);
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBeTruthy();
  });

  it("envía la imagen como bloque type:image con base64 source", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new ClaudeProvider().parseReceipt({ ...baseInput, imageMimeType: "image/png", imageBase64: "QWE" });
    const body = JSON.parse(mock.mock.calls[0]?.[1] && (mock.mock.calls[0]![1] as RequestInit).body as string);
    const imageBlock = body.messages[0].content.find((c: { type: string }) => c.type === "image");
    expect(imageBlock.source.media_type).toBe("image/png");
    expect(imageBlock.source.data).toBe("QWE");
  });

  it("401 → auth", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 401 }));
    try {
      await new ClaudeProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("auth");
    }
  });

  it("429 → rate_limit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 429 }));
    try {
      await new ClaudeProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("rate_limit");
    }
  });

  it("JSON malformado → retry estricto y luego parse", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const bad = { content: [{ type: "text", text: "not json" }] };
    mock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(bad), { status: 200 })),
    );
    try {
      await new ClaudeProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("parse");
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
