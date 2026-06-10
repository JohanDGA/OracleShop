import { parseResultSchema } from "@oraculo/validations";
import { toAIError, wrapWithText } from "./error";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AIProvider, AIProviderInput, ParseResult } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface GeminiResponseBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  async parseReceipt(input: AIProviderInput): Promise<ParseResult> {
    const result = await this.call(input, false);
    if (result.items.length === 0) {
      const e = toAIError(new Error("Unreadable receipt"), "gemini");
      e.kind = "unreadable";
      throw e;
    }
    return result;
  }

  private async call(input: AIProviderInput, strict: boolean): Promise<ParseResult> {
    const url = `${ENDPOINT}?key=${encodeURIComponent(input.apiKey)}`;
    const systemPrompt = buildSystemPrompt() + (strict ? "\nIMPORTANTE: SOLO JSON. Nada de markdown, ni texto fuera del JSON." : "");
    const userPrompt = buildUserPrompt(input.canonicalHints);
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: userPrompt },
            { inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw toAIError(e, "gemini");
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw await wrapWithText(toAIError(response, "gemini"), response);
    }
    let json: GeminiResponseBody;
    try {
      json = (await response.json()) as GeminiResponseBody;
    } catch (e) {
      const err = toAIError(e instanceof Error ? e : new Error("json parse failed"), "gemini");
      err.kind = "parse";
      throw err;
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const e = toAIError(new Error("missing text in response"), "gemini");
      e.kind = "parse";
      throw e;
    }
    return this.parseOrRetry(text, input, strict);
  }

  private async parseOrRetry(text: string, input: AIProviderInput, alreadyStrict: boolean): Promise<ParseResult> {
    try {
      const obj = JSON.parse(text) as unknown;
      return parseResultSchema.parse(obj);
    } catch (parseErr) {
      if (alreadyStrict) {
        const e = toAIError(parseErr instanceof Error ? parseErr : new Error("parse failed"), "gemini");
        e.kind = "parse";
        e.rawResponse = text;
        throw e;
      }
      return this.call(input, true);
    }
  }
}
