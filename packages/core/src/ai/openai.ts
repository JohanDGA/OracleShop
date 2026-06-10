import { parseResultSchema } from "@oraculo/validations";
import { toAIError, wrapWithText } from "./error";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AIProvider, AIProviderInput, ParseResult } from "./types";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

interface OpenAIResponseBody {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  async parseReceipt(input: AIProviderInput): Promise<ParseResult> {
    const result = await this.call(input, false);
    if (result.items.length === 0) {
      const e = toAIError(new Error("Unreadable receipt"), "openai");
      e.kind = "unreadable";
      throw e;
    }
    return result;
  }

  private async call(input: AIProviderInput, strict: boolean): Promise<ParseResult> {
    const systemPrompt =
      buildSystemPrompt() + (strict ? "\nIMPORTANTE: SOLO JSON, sin markdown." : "");
    const userPrompt = buildUserPrompt(input.canonicalHints);
    const body = {
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: { url: `data:${input.imageMimeType};base64,${input.imageBase64}` },
            },
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
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw toAIError(e, "openai");
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw await wrapWithText(toAIError(response, "openai"), response);
    }
    const json = (await response.json()) as OpenAIResponseBody;
    const text = json.choices?.[0]?.message?.content;
    if (!text) {
      const e = toAIError(new Error("missing content"), "openai");
      e.kind = "parse";
      throw e;
    }
    try {
      return parseResultSchema.parse(JSON.parse(text) as unknown);
    } catch (err) {
      if (strict) {
        const e = toAIError(err instanceof Error ? err : new Error("parse"), "openai");
        e.kind = "parse";
        e.rawResponse = text;
        throw e;
      }
      return this.call(input, true);
    }
  }
}
