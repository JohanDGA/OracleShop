import { parseResultSchema } from "@oraculo/validations";
import { toAIError, wrapWithText } from "./error";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AIProvider, AIProviderInput, ParseResult } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-20250514";

interface ClaudeResponseBody {
  content?: Array<{ type: string; text?: string }>;
}

export class ClaudeProvider implements AIProvider {
  readonly name = "claude" as const;

  async parseReceipt(input: AIProviderInput): Promise<ParseResult> {
    const result = await this.call(input, false);
    if (result.items.length === 0) {
      const e = toAIError(new Error("Unreadable receipt"), "claude");
      e.kind = "unreadable";
      throw e;
    }
    return result;
  }

  private async call(input: AIProviderInput, strict: boolean): Promise<ParseResult> {
    const systemPrompt =
      buildSystemPrompt() +
      (strict ? "\nIMPORTANTE: SOLO JSON. Nada de markdown ni texto fuera del JSON." : "");
    const userPrompt = buildUserPrompt(input.canonicalHints);
    const body = {
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: input.imageMimeType, data: input.imageBase64 },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw toAIError(e, "claude");
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw await wrapWithText(toAIError(response, "claude"), response);
    }
    const json = (await response.json()) as ClaudeResponseBody;
    const text = json.content?.find((c) => c.type === "text")?.text;
    if (!text) {
      const e = toAIError(new Error("missing text"), "claude");
      e.kind = "parse";
      throw e;
    }
    try {
      return parseResultSchema.parse(JSON.parse(text) as unknown);
    } catch (err) {
      if (strict) {
        const e = toAIError(err instanceof Error ? err : new Error("parse"), "claude");
        e.kind = "parse";
        e.rawResponse = text;
        throw e;
      }
      return this.call(input, true);
    }
  }
}
