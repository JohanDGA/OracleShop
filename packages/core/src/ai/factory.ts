import { GeminiProvider } from "./gemini";
import { ClaudeProvider } from "./claude";
import { OpenAIProvider } from "./openai";
import type { AIProvider, ProviderName } from "./types";

export function createProvider(name: ProviderName): AIProvider {
  switch (name) {
    case "gemini":
      return new GeminiProvider();
    case "claude":
      return new ClaudeProvider();
    case "openai":
      return new OpenAIProvider();
  }
}
